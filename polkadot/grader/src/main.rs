mod deploy;
mod chain_runner;
mod verifier;
mod reporter;
mod subscan_verifier;

use clap::Parser;
use anyhow::Result;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "polkadot-grader", about = "Grade Chain of Contracts lab submissions (Polkadot)")]
struct Args {
    /// Path to the student's contract directory
    #[arg(short, long)]
    student_dir: Option<PathBuf>,

    /// Student name (for report output)
    #[arg(short, long, default_value = "student")]
    name: String,

    /// Substrate node WebSocket URL
    #[arg(short, long, default_value = "ws://127.0.0.1:9944")]
    rpc_url: String,

    /// Suri (seed phrase) for the test account
    #[arg(short, long, default_value = "//Alice")]
    suri: String,

    /// Grading mode: "local" (default) or "subscan"
    #[arg(short = 'm', long, default_value = "local")]
    mode: String,

    /// Subscan API key (required for subscan mode)
    #[arg(long)]
    subscan_api_key: Option<String>,

    /// Subscan network (e.g. "polkadot", "westend", "rococo")
    #[arg(long, default_value = "westend")]
    subscan_network: String,

    /// Deployed ChainEntry address (required for subscan mode)
    #[arg(long)]
    chain_entry_addr: Option<String>,

    /// Deployed ChainLink address (optional for subscan mode)
    #[arg(long)]
    chain_link_addr: Option<String>,

    /// Deployed ChainTerminal address (required for subscan mode)
    #[arg(long)]
    chain_terminal_addr: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    if args.mode == "subscan" {
        return run_subscan_mode(&args).await;
    }

    println!("=== Polkadot Grader for {} ===", args.name);
    println!("RPC: {}", args.rpc_url);
    println!("Student dir: {:?}", args.student_dir);

    let student_dir = args.student_dir.unwrap_or_else(|| {
        std::env::current_dir().unwrap()
    });

    // Phase 1: Deploy
    let deploy_result = deploy::deploy_contracts(
        &args.rpc_url,
        &args.suri,
        &student_dir,
    ).await;

    let (contract_addr, result) = match deploy_result {
        Ok(addrs) => {
            println!("  ✓ Deployment successful");
            println!("    ChainEntry: {}", addrs.chain_entry);
            println!("    ChainLink: {}", addrs.chain_link);
            println!("    ChainTerminal: {}", addrs.chain_terminal);
            (Some(addrs), reporter::PhaseResult::pass("Deployment"))
        }
        Err(e) => {
            println!("  ✗ Deployment failed: {}", e);
            (None, reporter::PhaseResult::fail("Deployment", e.to_string()))
        }
    };

    let mut event_result = reporter::PhaseResult::skip("Event Verification");
    let mut state_result = reporter::PhaseResult::skip("State Verification");

    // Phase 2: Run the chain
    if let Some(ref addrs) = contract_addr {
        match chain_runner::run_chain(&args.rpc_url, &args.suri, addrs).await {
            Ok(events) => {
                println!("  ✓ Chain execution succeeded");

                // Phase 3: Verify events
                event_result = verifier::verify_event_order(&events);
                if event_result.passed {
                    println!("  ✓ Event order correct");
                } else {
                    println!("  ✗ Event order incorrect");
                }

                // Phase 4: Verify final state
                state_result = verifier::verify_final_state(&args.rpc_url, addrs).await;
                if state_result.passed {
                    println!("  ✓ Final state correct");
                } else {
                    println!("  ✗ Final state incorrect");
                }
            }
            Err(e) => {
                println!("  ✗ Chain execution failed: {}", e);
                event_result = reporter::PhaseResult::fail("Event Verification", e.to_string());
                state_result = reporter::PhaseResult::fail("State Verification", "Chain did not execute".into());
            }
        }
    }

    // Generate report
    let report = reporter::generate_report(
        &args.name,
        result,
        event_result,
        state_result,
    );

    // Output to stdout and file
    let json = serde_json::to_string_pretty(&report)?;
    println!("\n{}", json);

    // Write to file alongside student dir
    let output_path = std::env::current_dir()?.join(format!("{}-polkadot-report.json", args.name));
    std::fs::write(&output_path, &json)?;
    println!("\nReport written to: {}", output_path.display());

    Ok(())
}

async fn run_subscan_mode(args: &Args) -> Result<()> {
    println!("=== Polkadot Subscan Verification for {} ===", args.name);
    println!("Network: {}", args.subscan_network);

    let entry = args.chain_entry_addr.as_ref()
        .expect("--chain-entry-addr is required in subscan mode");
    let terminal = args.chain_terminal_addr.as_ref()
        .expect("--chain-terminal-addr is required in subscan mode");
    let link = args.chain_link_addr.as_ref();
    let api_key = args.subscan_api_key.as_deref();

    let report = subscan_verifier::verify_on_subscan(
        &args.name,
        &args.subscan_network,
        entry,
        link.map(|s| s.as_str()),
        terminal,
        api_key,
    ).await;

    let json = serde_json::to_string_pretty(&report)?;
    println!("\n{}", json);

    let output_path = std::env::current_dir()?.join(format!("{}-subscan-report.json", args.name));
    std::fs::write(&output_path, &json)?;
    println!("\nReport written to: {}", output_path.display());

    Ok(())
}