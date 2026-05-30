const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/**
 * Runs the Ethereum Hardhat grader for a specific student submission.
 *
 * @param {string} studentDir - Path to student's Ethereum contract files
 * @param {string} studentName - Student identifier for the report
 * @param {object} config - Grading configuration
 * @returns {Promise<object>} Grading report
 */
function runEthereumGrader(studentDir, studentName, config) {
  return new Promise((resolve, reject) => {
    const graderDir = path.resolve(__dirname, "..", config.ethereum.graderPath);
    const outputDir = path.resolve(__dirname, "..", config.output.dir);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Copy student files to grader's students directory
    const studentTargetDir = path.join(graderDir, "students", studentName);
    if (!fs.existsSync(studentTargetDir)) {
      fs.mkdirSync(studentTargetDir, { recursive: true });
    }

    try {
      const files = fs.readdirSync(studentDir);
      for (const file of files) {
        if (file.endsWith(".sol") || file.endsWith(".vy")) {
          fs.copyFileSync(
            path.join(studentDir, file),
            path.join(studentTargetDir, file)
          );
        }
      }
    } catch (err) {
      return reject(new Error(`Failed to copy student files: ${err.message}`));
    }

    // Run Hardhat grader
    const child = spawn("npx", ["hardhat", "run", "scripts/grade.js", "--network", "hardhat"], {
      cwd: graderDir,
      env: {
        ...process.env,
        STUDENT_NAME: studentName,
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.ethereum.timeoutMs || 120000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Ethereum grader exited with code ${code}`);
        console.error(`stderr: ${stderr}`);
      }

      // Read the generated report
      const reportPath = path.join(outputDir, `${studentName}-eth-report.json`);
      if (fs.existsSync(reportPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
          resolve(report);
        } catch (err) {
          resolve({
            student: studentName,
            platform: "ethereum",
            score: 0,
            maxScore: 100,
            passed: false,
            errors: [`Failed to parse report: ${err.message}`],
            raw: stdout,
          });
        }
      } else {
        resolve({
          student: studentName,
          platform: "ethereum",
          score: 0,
          maxScore: 100,
          passed: false,
          errors: ["No report generated. Grader may have failed."],
          raw: stdout,
          stderr,
        });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start Ethereum grader: ${err.message}`));
    });
  });
}

/**
 * Runs Etherscan-based verification for contracts deployed on a real network.
 *
 * @param {object} options
 * @param {string} options.chainEntryAddr - ChainEntry contract address
 * @param {string} options.chainLinkAddr - ChainLink contract address
 * @param {string} options.chainTerminalAddr - ChainTerminal contract address
 * @param {number} options.chainId - Target chain ID (1=mainnet, 11155111=sepolia, etc.)
 * @param {string} options.rpcUrl - JSON-RPC URL for state queries
 * @param {string} options.studentName - Student name for reporting
 * @param {object} config - Grading configuration
 * @returns {Promise<object>} Verification report
 */
async function verifyOnEtherscan({ chainEntryAddr, chainLinkAddr, chainTerminalAddr, chainId, rpcUrl, studentName }, config) {
  const graderDir = path.resolve(__dirname, "..", config.ethereum.graderPath);
  const outputDir = path.resolve(__dirname, "..", config.output.dir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const apiKey = process.env[config.ethereum.etherscan.apiKeyEnv] || "";
  if (!apiKey) {
    return {
      student: studentName,
      platform: "ethereum",
      mode: "etherscan",
      score: 0,
      maxScore: 100,
      passed: false,
      errors: [`${config.ethereum.etherscan.apiKeyEnv} environment variable not set`],
    };
  }

  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["hardhat", "run", "scripts/grade.js", "--network", "hardhat"], {
      cwd: graderDir,
      env: {
        ...process.env,
        GRADER_MODE: "etherscan",
        ETHERSCAN_API_KEY: apiKey,
        CHAIN_ENTRY_ADDR: chainEntryAddr,
        CHAIN_LINK_ADDR: chainLinkAddr || "",
        CHAIN_TERMINAL_ADDR: chainTerminalAddr,
        TARGET_CHAIN_ID: String(chainId),
        RPC_URL: rpcUrl || "",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.ethereum.timeoutMs || 120000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      const reportPath = path.join(outputDir, "etherscan-verify-report.json");
      if (fs.existsSync(reportPath)) {
        try {
          resolve(JSON.parse(fs.readFileSync(reportPath, "utf-8")));
        } catch (err) {
          resolve({
            student: studentName,
            platform: "ethereum",
            mode: "etherscan",
            score: 0,
            maxScore: 100,
            passed: false,
            errors: [`Failed to parse etherscan report: ${err.message}`],
            raw: stdout,
          });
        }
      } else {
        resolve({
          student: studentName,
          platform: "ethereum",
          mode: "etherscan",
          score: 0,
          maxScore: 100,
          passed: false,
          errors: ["Etherscan verification did not produce a report"],
          raw: stdout,
        });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start Etherscan verifier: ${err.message}`));
    });
  });
}

module.exports = { runEthereumGrader, verifyOnEtherscan };