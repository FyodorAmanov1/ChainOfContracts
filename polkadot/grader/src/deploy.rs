use anyhow::{Context, Result};
use std::path::Path;

/// Addresses of deployed generic chain contracts
pub struct ContractAddresses {
    pub chain_entry: String,
    pub chain_link: String,
    pub chain_terminal: String,
}

/// Deploys the three generic contracts to a substrate node.
///
/// Steps:
/// 1. Build each contract with `cargo contract build`
/// 2. Upload code blob via subxt contract API
/// 3. Instantiate each contract in reverse dependency order
/// 4. Wire addresses: Terminal.setPrevLink(Link), Link.setNextLink(Terminal),
///    Link.setPrevLink(Entry), Entry.setNextLink(Link)
///
/// For N-link chains, deploy additional ChainLink instances and wire sequentially.
pub async fn deploy_contracts(
    rpc_url: &str,
    suri: &str,
    student_dir: &Path,
) -> Result<ContractAddresses> {
    // In a real implementation:
    // 1. Build each contract using std::process::Command("cargo", ["contract", "build"])
    // 2. Connect via subxt::OnlineClient::from_url(rpc_url).await?
    // 3. Create signer from suri
    // 4. Upload code for each contract:
    //    - Read .contract file
    //    - Call pallet_contracts::upload_code extrinsic
    // 5. Instantiate in reverse dependency order:
    //    - Instantiate ChainTerminal (no args)
    //    - Instantiate ChainLink(step=1) with Terminal's address
    //    - Instantiate ChainEntry with Link's address
    // 6. Wire setters:
    //    - ChainTerminal.setPrevLink(linkAddr)
    //    - ChainLink.setNextLink(terminalAddr)
    //    - ChainLink.setPrevLink(entryAddr)
    //    - ChainEntry.setNextLink(linkAddr)
    //
    // For the lab scaffold, return placeholder addresses to demonstrate the structure.

    // Placeholder for CI/testing without a running node
    if std::env::var("POLKADOT_GRADER_DRY_RUN").is_ok() {
        return Ok(ContractAddresses {
            chain_entry: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1uS6r5gUFa".into(),
            chain_link: "5CiPPseXPECbkjWCa6MnjNokrgYjMqmKjGKrT4H3vW4TrQx9".into(),
            chain_terminal: "5Gv8kX7j5KjLqYjKjqLqYjKjqLqYjKjqLqYjKjqLqYjKjL".into(),
        });
    }

    // Real implementation would compile + upload + instantiate here
    Err(anyhow::anyhow!(
        "Deployment requires a running substrate-contracts-node. \
         Set POLKADOT_GRADER_DRY_RUN=1 for structure testing."
    ))
}

/// Build a contract using `cargo contract build`
pub fn build_contract(contract_dir: &Path) -> Result<()> {
    let status = std::process::Command::new("cargo")
        .args(["contract", "build", "--release"])
        .current_dir(contract_dir)
        .status()
        .context("Failed to run cargo contract build")?;

    if !status.success() {
        anyhow::bail!("cargo contract build failed for {:?}", contract_dir);
    }

    Ok(())
}