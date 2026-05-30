const fs = require("fs");
const path = require("path");

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf-8"));

const { runEthereumGrader, verifyOnEtherscan } = require("./lib/ethereum-grader");
const { runPolkadotGrader, verifyOnSubscan } = require("./lib/polkadot-grader");
const { mergeReports, generateCsvSummary, generateSummaryJson } = require("./lib/report-merger");

// Parse CLI args
const args = process.argv.slice(2);
const flags = {
  ethereum: args.includes("--ethereum"),
  polkadot: args.includes("--polkadot"),
  all: args.includes("--all") || (!args.includes("--ethereum") && !args.includes("--polkadot") && !args.includes("--etherscan") && !args.includes("--subscan")),
  etherscan: args.includes("--etherscan"),
  subscan: args.includes("--subscan"),
  student: null,
  help: args.includes("--help") || args.includes("-h"),
  parallel: args.includes("--parallel"),
};

const studentIdx = args.indexOf("--student");
if (studentIdx !== -1 && studentIdx + 1 < args.length) {
  flags.student = args[studentIdx + 1];
}

// Extract --chain-entry, --chain-link, --chain-terminal for Etherscan/Subscan
function extractAddrArg(prefix) {
  const idx = args.indexOf(prefix);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

if (flags.help) {
  console.log(`
Chain of Contracts Lab — Master Grading Orchestrator

Usage:
  node run-grading.js [options]

Local Grading Options:
  --ethereum          Grade only Ethereum submissions (local Hardhat)
  --polkadot          Grade only Polkadot submissions (local node)
  --all               Grade both platforms (default)
  --student <name>    Grade a single student
  --parallel          Grade students concurrently

On-Chain Verification Options:
  --etherscan         Verify Ethereum contracts via Etherscan API
  --subscan           Verify Polkadot contracts via Subscan API
  --chain-entry <addr>    ChainEntry contract address
  --chain-link <addr>     ChainLink contract address (optional)
  --chain-terminal <addr> ChainTerminal contract address
  --chain-id <id>         Ethereum chain ID (default: 11155111)
  --rpc-url <url>         RPC URL for state queries (Ethereum)
  --subscan-network <net> Subscan network (default: westend)

Environment Variables:
  ETHERSCAN_API_KEY     Required for --etherscan mode
  SUBSCAN_API_KEY       Required for --subscan mode

Configuration:
  Edit config.json to set RPC URLs, thresholds, and paths.

Example:
  node run-grading.js --all
  node run-grading.js --student john_doe
  node run-grading.js --etherscan --chain-entry 0x... --chain-terminal 0x... --rpc-url https://...
  node run-grading.js --subscan --chain-entry 5... --chain-terminal 5... --subscan-network westend
`);
  process.exit(0);
}

// ── Etherscan Verification Mode ──
if (flags.etherscan) {
  const chainEntryAddr = extractAddrArg("--chain-entry");
  const chainLinkAddr = extractAddrArg("--chain-link");
  const chainTerminalAddr = extractAddrArg("--chain-terminal");
  const chainId = parseInt(extractAddrArg("--chain-id") || "11155111", 10);
  const rpcUrl = extractAddrArg("--rpc-url") || "";
  const studentName = flags.student || "etherscan-verify";

  if (!chainEntryAddr || !chainTerminalAddr) {
    console.error("Error: --chain-entry and --chain-terminal are required for --etherscan mode");
    process.exit(1);
  }

  verifyOnEtherscan({
    chainEntryAddr,
    chainLinkAddr,
    chainTerminalAddr,
    chainId,
    rpcUrl,
    studentName,
  }, config).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    const outputDir = path.resolve(__dirname, config.output.dir);
    fs.writeFileSync(
      path.join(outputDir, `${studentName}-etherscan-report.json`),
      JSON.stringify(report, null, 2)
    );
    console.log(`\nReport written to: ${path.join(outputDir, `${studentName}-etherscan-report.json`)}`);
  }).catch((err) => {
    console.error("Etherscan verification failed:", err);
    process.exit(1);
  });
  return;
}

// ── Subscan Verification Mode ──
if (flags.subscan) {
  const chainEntryAddr = extractAddrArg("--chain-entry");
  const chainLinkAddr = extractAddrArg("--chain-link");
  const chainTerminalAddr = extractAddrArg("--chain-terminal");
  const network = extractAddrArg("--subscan-network") || "westend";
  const studentName = flags.student || "subscan-verify";

  if (!chainEntryAddr || !chainTerminalAddr) {
    console.error("Error: --chain-entry and --chain-terminal are required for --subscan mode");
    process.exit(1);
  }

  verifyOnSubscan({
    chainEntryAddr,
    chainLinkAddr,
    chainTerminalAddr,
    network,
    studentName,
  }, config).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    const outputDir = path.resolve(__dirname, config.output.dir);
    fs.writeFileSync(
      path.join(outputDir, `${studentName}-subscan-report.json`),
      JSON.stringify(report, null, 2)
    );
    console.log(`\nReport written to: ${path.join(outputDir, `${studentName}-subscan-report.json`)}`);
  }).catch((err) => {
    console.error("Subscan verification failed:", err);
    process.exit(1);
  });
  return;
}

// ── Local Grading Mode ──────────────────────────────────────────

async function gradeStudent(studentName, studentBaseDir) {
  const ethDir = path.join(studentBaseDir, `${studentName}-eth`);
  const polkadotDir = path.join(studentBaseDir, `${studentName}-polkadot`);

  let ethReport = null;
  let polkadotReport = null;

  console.log(`\n========================================`);
  console.log(`Grading: ${studentName}`);
  console.log(`========================================`);

  // Ethereum grading
  if (flags.ethereum || flags.all) {
    if (fs.existsSync(ethDir)) {
      console.log(`  Ethereum: ${ethDir}`);
      ethReport = await runEthereumGrader(ethDir, studentName, config);
      console.log(`  Ethereum score: ${ethReport.score}% ${ethReport.passed ? "[PASS]" : "[FAIL]"}`);
    } else {
      console.log(`  Ethereum: directory not found: ${ethDir}`);
      ethReport = {
        student: studentName, platform: "ethereum", score: 0, maxScore: 100,
        passed: false, errors: ["Student directory not found"],
      };
    }
  }

  // Polkadot grading
  if (flags.polkadot || flags.all) {
    if (fs.existsSync(polkadotDir)) {
      console.log(`  Polkadot: ${polkadotDir}`);
      polkadotReport = await runPolkadotGrader(polkadotDir, studentName, config);
      console.log(`  Polkadot score: ${polkadotReport.score}% ${polkadotReport.passed ? "[PASS]" : "[FAIL]"}`);
    } else {
      console.log(`  Polkadot: directory not found: ${polkadotDir}`);
      polkadotReport = {
        student: studentName, platform: "polkadot", score: 0, maxScore: 100,
        passed: false, errors: ["Student directory not found"],
      };
    }
  }

  return mergeReports(ethReport || { student: studentName, score: 0, errors: [] },
    polkadotReport || { student: studentName, score: 0, errors: [] }, config);
}

async function main() {
  const outputDir = path.resolve(__dirname, config.output.dir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const studentBaseDir = path.resolve(__dirname, config.grading.studentDir);

  let studentNames = [];

  if (flags.student) {
    studentNames = [flags.student];
  } else {
    // Discover students from directories
    if (fs.existsSync(studentBaseDir)) {
      const entries = fs.readdirSync(studentBaseDir, { withFileTypes: true });
      const dirs = new Set();
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Strip -eth or -polkadot suffix to get student name
          const name = entry.name.replace(/-eth$/, "").replace(/-polkadot$/, "");
          dirs.add(name);
        }
      }
      studentNames = Array.from(dirs).sort();
    }
  }

  if (studentNames.length === 0) {
    console.log("No students found. Create directories in sample-submissions/");
    console.log("  sample-submissions/student_name-eth/");
    console.log("  sample-submissions/student_name-polkadot/");
    process.exit(0);
  }

  console.log(`Found ${studentNames.length} student(s): ${studentNames.join(", ")}`);

  // Grade students
  const mergedReports = [];

  if (flags.parallel) {
    const results = await Promise.all(
      studentNames.map((name) => gradeStudent(name, studentBaseDir))
    );
    mergedReports.push(...results);
  } else {
    for (const name of studentNames) {
      const report = await gradeStudent(name, studentBaseDir);
      mergedReports.push(report);

      // Write individual merged report
      fs.writeFileSync(
        path.join(outputDir, `${name}-merged-report.json`),
        JSON.stringify(report, null, 2)
      );
    }
  }

  // Generate summaries
  const summary = generateSummaryJson(mergedReports);
  fs.writeFileSync(
    path.join(outputDir, "grading-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  if (config.output.generateCsvSummary) {
    generateCsvSummary(mergedReports, path.join(outputDir, "grading-summary.csv"));
  }

  // Print summary table
  console.log(`\n========================================`);
  console.log(`GRADING SUMMARY`);
  console.log(`========================================`);
  console.log(`Total Students: ${summary.totalStudents}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Pass Rate: ${summary.passRate}%`);
  console.log(`Average Score: ${summary.averageScore}%`);
  console.log(`========================================`);
  console.log(`\nDetailed reports in: ${outputDir}`);

  // Print individual scores
  console.log(`\nScores:`);
  for (const r of summary.reports) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`  ${r.student.padEnd(20)} ${String(r.combinedScore).padEnd(6)}% ${status}  (Eth: ${r.ethScore ?? "N/A"}, Polkadot: ${r.polkadotScore ?? "N/A"})`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});