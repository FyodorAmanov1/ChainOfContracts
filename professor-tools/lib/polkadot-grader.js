const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/**
 * Runs the Polkadot Rust grader for a specific student submission.
 *
 * @param {string} studentDir - Path to student's Polkadot contract files
 * @param {string} studentName - Student identifier for the report
 * @param {object} config - Grading configuration
 * @returns {Promise<object>} Grading report
 */
function runPolkadotGrader(studentDir, studentName, config) {
  return new Promise((resolve, reject) => {
    const graderBinary = path.resolve(__dirname, "..", config.polkadot.graderBinary);
    const rpcUrl = config.polkadot.rpcUrl;
    const suri = "//Alice";

    // Check if binary exists
    if (!fs.existsSync(graderBinary)) {
      return resolve({
        student: studentName,
        platform: "polkadot",
        score: 0,
        maxScore: 100,
        passed: false,
        errors: [
          `Polkadot grader binary not found at ${graderBinary}. ` +
          `Run 'cd polkadot/grader && cargo build --release' first.`,
        ],
      });
    }

    // Run the grader binary
    const child = spawn(graderBinary, [
      "--student-dir", studentDir,
      "--name", studentName,
      "--rpc-url", rpcUrl,
      "--suri", suri,
      "--mode", "local",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.polkadot.timeoutMs || 180000,
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
        console.error(`Polkadot grader exited with code ${code}`);
        console.error(`stderr: ${stderr}`);
      }

      // Try to parse JSON report from stdout (last JSON object)
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const report = JSON.parse(jsonMatch[0]);
          resolve(report);
        } else {
          resolve({
            student: studentName,
            platform: "polkadot",
            score: 0,
            maxScore: 100,
            passed: false,
            errors: ["No JSON report in grader output"],
            raw: stdout,
            stderr,
          });
        }
      } catch (err) {
        resolve({
          student: studentName,
          platform: "polkadot",
          score: 0,
          maxScore: 100,
          passed: false,
          errors: [`Failed to parse grader output: ${err.message}`],
          raw: stdout,
          stderr,
        });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start Polkadot grader: ${err.message}`));
    });
  });
}

/**
 * Runs Subscan-based verification for contracts deployed on a real network.
 *
 * @param {object} options
 * @param {string} options.chainEntryAddr - Deployed ChainEntry address
 * @param {string} options.chainLinkAddr - Deployed ChainLink address
 * @param {string} options.chainTerminalAddr - Deployed ChainTerminal address
 * @param {string} options.network - Subscan network name (westend, rococo, polkadot)
 * @param {string} options.studentName - Student name for reporting
 * @param {object} config - Grading configuration
 * @returns {Promise<object>} Verification report
 */
async function verifyOnSubscan({ chainEntryAddr, chainLinkAddr, chainTerminalAddr, network, studentName }, config) {
  const graderBinary = path.resolve(__dirname, "..", config.polkadot.graderBinary);
  const apiKey = process.env[config.polkadot.subscan.apiKeyEnv] || "";

  if (!fs.existsSync(graderBinary)) {
    return {
      student: studentName,
      platform: "polkadot",
      mode: "subscan",
      score: 0,
      maxScore: 100,
      passed: false,
      errors: [
        `Polkadot grader binary not found at ${graderBinary}. ` +
        `Run 'cd polkadot/grader && cargo build --release' first.`,
      ],
    };
  }

  return new Promise((resolve, reject) => {
    const args = [
      "--name", studentName,
      "--mode", "subscan",
      "--subscan-network", network,
      "--chain-entry-addr", chainEntryAddr,
      "--chain-terminal-addr", chainTerminalAddr,
    ];

    if (chainLinkAddr) {
      args.push("--chain-link-addr", chainLinkAddr);
    }
    if (apiKey) {
      args.push("--subscan-api-key", apiKey);
    }

    const child = spawn(graderBinary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.polkadot.timeoutMs || 180000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[0]));
        } else {
          resolve({
            student: studentName,
            platform: "polkadot",
            mode: "subscan",
            score: 0,
            maxScore: 100,
            passed: false,
            errors: ["No JSON report in Subscan verifier output"],
            raw: stdout,
          });
        }
      } catch (err) {
        resolve({
          student: studentName,
          platform: "polkadot",
          mode: "subscan",
          score: 0,
          maxScore: 100,
          passed: false,
          errors: [`Failed to parse Subscan verifier output: ${err.message}`],
          raw: stdout,
        });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start Subscan verifier: ${err.message}`));
    });
  });
}

module.exports = { runPolkadotGrader, verifyOnSubscan };