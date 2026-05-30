const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { verifyEventOrder, verifyFinalState, extractEvents, EXPECTED_EVENT_ORDER } = require("./utils/chain-verifier");
const { generateReport, generateSummary } = require("./utils/report-generator");
const { verifyOnEtherscan } = require("./utils/etherscan-verifier");

async function gradeStudent(studentDir, studentName) {
  console.log(`\n=== Grading ${studentName} (Ethereum) ===`);

  const result = {
    studentName,
    compileOk: false,
    compileErrors: [],
    deployOk: false,
    deployErrors: [],
    eventOrder: { pass: false, received: [], errors: [] },
    finalState: { pass: false, record: null, errors: [] },
    gasUsed: null,
  };

  // ── Phase 1: Compilation ──────────────────────────────────────
  try {
    // If a student directory was provided, swap the contracts source to that directory
    if (studentDir !== path.join(__dirname, "..", "contracts")) {
      // Clear Hardhat's artifact cache before swapping
      await hre.run("clean");
      // Reconfigure hardhat to use the student's contracts directory
      hre.config.paths.sources = studentDir;
    }
    const ChainEntry = await hre.ethers.getContractFactory("ChainEntry");
    const ChainLink = await hre.ethers.getContractFactory("ChainLink");
    const ChainTerminal = await hre.ethers.getContractFactory("ChainTerminal");
    result.compileOk = true;
    console.log("  ✓ Compilation successful");
  } catch (err) {
    result.compileErrors.push(err.message);
    console.error("  ✗ Compilation failed:", err.message);
    return generateReport(result);
  }

  // ── Phase 2: Deployment ───────────────────────────────────────
  let chainEntry, chainLink, chainTerminal;
  try {
    const [deployer] = await hre.ethers.getSigners();
    console.log(`  Deployer: ${deployer.address}`);

    // Deploy Terminal first (no dependencies)
    chainTerminal = await hre.ethers.deployContract("ChainTerminal");
    await chainTerminal.waitForDeployment();
    const tAddr = await chainTerminal.getAddress();
    console.log(`  ✓ ChainTerminal deployed at ${tAddr}`);

    // Deploy Link (needs Terminal's address as nextLink)
    chainLink = await hre.ethers.deployContract("ChainLink", [1]);
    await chainLink.waitForDeployment();
    const lAddr = await chainLink.getAddress();
    console.log(`  ✓ ChainLink(step=1) deployed at ${lAddr}`);

    // Deploy Entry (no dependencies yet)
    chainEntry = await hre.ethers.deployContract("ChainEntry");
    await chainEntry.waitForDeployment();
    const eAddr = await chainEntry.getAddress();
    console.log(`  ✓ ChainEntry deployed at ${eAddr}`);

    // Wire contracts together (reverse dependency order)
    let tx = await chainTerminal.setPrevLink(lAddr);
    await tx.wait();
    console.log("  ✓ ChainTerminal.setPrevLink(Link)");

    tx = await chainLink.setNextLink(tAddr);
    await tx.wait();
    console.log("  ✓ ChainLink.setNextLink(Terminal)");

    tx = await chainLink.setPrevLink(eAddr);
    await tx.wait();
    console.log("  ✓ ChainLink.setPrevLink(Entry)");

    tx = await chainEntry.setNextLink(lAddr);
    await tx.wait();
    console.log("  ✓ ChainEntry.setNextLink(Link)");

    result.deployOk = true;
  } catch (err) {
    result.deployErrors.push(err.message);
    console.error("  ✗ Deployment failed:", err.message);
    return generateReport(result);
  }

  // ── Phase 3: Chain Execution ───────────────────────────────────
  let receipt;
  try {
    const testData = hre.ethers.toUtf8Bytes("Hello from ChainOfContractsLab!");

    const tx = await chainEntry.startChain(testData);
    receipt = await tx.wait();

    result.gasUsed = receipt.gasUsed;
    console.log(`  ✓ startChain executed (gas: ${receipt.gasUsed})`);
  } catch (err) {
    result.deployErrors.push(`Chain execution failed: ${err.message}`);
    console.error("  ✗ Chain execution failed:", err.message);
    return generateReport(result);
  }

  // ── Phase 4: Event Verification ───────────────────────────────
  const allLogs = receipt.logs.map((log) => {
    try {
      for (const contract of [chainEntry, chainLink, chainTerminal]) {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed) return { eventName: parsed.name, args: parsed.args, logIndex: log.index };
        } catch {}
      }
    } catch {}
    return { eventName: "UNKNOWN", args: [], logIndex: log.index };
  }).filter((e) => e.eventName !== "UNKNOWN");

  result.eventOrder = verifyEventOrder(allLogs);
  if (result.eventOrder.pass) {
    console.log("  ✓ Event order correct:", result.eventOrder.received.join(" → "));
  } else {
    console.error("  ✗ Event order incorrect:", result.eventOrder.errors.join("; "));
  }

  // ── Phase 5: State Verification ───────────────────────────────
  const chainId = 1; // First chain execution
  result.finalState = await verifyFinalState(chainTerminal, chainId);
  if (result.finalState.pass) {
    console.log("  ✓ Final state correct");
  } else {
    console.error("  ✗ Final state incorrect:", result.finalState.errors.join("; "));
  }

  return generateReport(result);
}

async function main() {
  const studentsDir = path.join(__dirname, "..", "students");
  const outputDir = path.join(__dirname, "..", "output");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const specificStudent = process.env.STUDENT_NAME;
  const deployMode = process.env.GRADER_MODE || "local"; // "local" or "etherscan"
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY || "";
  const rpcUrl = process.env.RPC_URL || "";

  if (deployMode === "etherscan") {
    // Etherscan verification mode: check contracts already deployed on-chain
    const entryAddr = process.env.CHAIN_ENTRY_ADDR || "";
    const linkAddr = process.env.CHAIN_LINK_ADDR || "";
    const terminalAddr = process.env.CHAIN_TERMINAL_ADDR || "";
    const chainId = parseInt(process.env.TARGET_CHAIN_ID || "1", 10);

    if (!etherscanApiKey || !entryAddr || !terminalAddr) {
      console.error("Etherscan mode requires: ETHERSCAN_API_KEY, CHAIN_ENTRY_ADDR, CHAIN_TERMINAL_ADDR");
      process.exit(1);
    }

    console.log(`\n=== Etherscan Verification Mode ===`);
    console.log(`  Network Chain ID: ${chainId}`);
    console.log(`  ChainEntry:  ${entryAddr}`);
    console.log(`  ChainLink:   ${linkAddr || "N/A"}`);
    console.log(`  ChainTerminal: ${terminalAddr}`);

    const etherscanResult = await verifyOnEtherscan({
      apiKey: etherscanApiKey,
      chainEntryAddr: entryAddr,
      chainLinkAddr: linkAddr,
      chainTerminalAddr: terminalAddr,
      chainId,
      rpcUrl,
      studentName: specificStudent || "etherscan-verify",
    });

    const reportPath = path.join(outputDir, `etherscan-verify-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(etherscanResult, null, 2));
    console.log(`\nEtherscan verification report: ${reportPath}`);
    return;
  }

  // Local Hardhat grading mode
  let studentDirs;
  if (specificStudent) {
    const dir = path.join(studentsDir, specificStudent);
    if (fs.existsSync(dir)) {
      studentDirs = [{ name: specificStudent, path: dir }];
    } else {
      console.error(`Student directory not found: ${dir}`);
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(studentsDir)) {
      console.log("No student directories found. Grading default contracts in contracts/...");
      studentDirs = [{ name: "default", path: path.join(__dirname, "..", "contracts") }];
    } else {
      const entries = fs.readdirSync(studentsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      if (entries.length === 0) {
        console.log("No student submissions found. Grading default contracts in contracts/...");
        studentDirs = [{ name: "default", path: path.join(__dirname, "..", "contracts") }];
      } else {
        studentDirs = entries.map((d) => ({ name: d.name, path: path.join(studentsDir, d.name) }));
      }
    }
  }

  const reports = [];
  for (const student of studentDirs) {
    const report = await gradeStudent(student.path, student.name);
    reports.push(report);

    fs.writeFileSync(
      path.join(outputDir, `${student.name}-eth-report.json`),
      JSON.stringify(report, null, 2)
    );
  }

  const summary = generateSummary(reports);
  fs.writeFileSync(
    path.join(outputDir, "ethereum-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n=== Ethereum Grading Complete ===`);
  console.log(`Passed: ${summary.passed}/${summary.totalStudents}`);
  console.log(`Average Score: ${summary.averageScore}%`);
  console.log(`Reports written to: ${outputDir}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});