const { ethers } = require("ethers");
const { verifyEventOrder, verifyFinalState, EXPECTED_EVENT_ORDER } = require("./chain-verifier");

/**
 * Supported Etherscan-like explorers by chain ID.
 */
const EXPLORER_URLS = {
  1: "https://api.etherscan.io",
  5: "https://api-goerli.etherscan.io",
  11155111: "https://api-sepolia.etherscan.io",
  137: "https://api.polygonscan.com",
  80001: "https://api-mumbai.polygonscan.com",
  42161: "https://api.arbiscan.io",
  10: "https://api-optimistic.etherscan.io",
};

/**
 * Fetches event logs for a given contract from Etherscan.
 * @param {string} apiKey - Etherscan API key
 * @param {string} contractAddress - Contract to query
 * @param {number} targetChainId - Chain ID
 * @returns {Promise<object[]>} Parsed event logs
 */
async function fetchContractEvents(apiKey, contractAddress, targetChainId) {
  const baseUrl = EXPLORER_URLS[targetChainId];
  if (!baseUrl) {
    throw new Error(`Unsupported chain ID: ${targetChainId}. Supported: ${Object.keys(EXPLORER_URLS).join(", ")}`);
  }

  const url = `${baseUrl}/api?module=logs&action=getLogs` +
    `&address=${contractAddress}` +
    `&page=1&offset=100` +
    `&sort=asc` +
    `&apikey=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "1") {
    console.warn(`  Etherscan warning for ${contractAddress}: ${data.message}`);
    return [];
  }

  return data.result || [];
}

/**
 * Decodes raw Etherscan event logs using a contract's ABI.
 * @param {object[]} rawLogs - Raw log entries from Etherscan API
 * @param {ethers.Interface} iface - ethers Interface for the contract
 * @param {string} contractName - Name for logging
 * @returns {object[]} Parsed event objects
 */
function decodeEtherscanLogs(rawLogs, iface, contractName) {
  const events = [];
  for (const log of rawLogs) {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(Boolean);
    try {
      const parsed = iface.parseLog({ topics, data: log.data });
      if (parsed) {
        events.push({
          eventName: parsed.name,
          args: parsed.args,
          transactionHash: log.transactionHash,
          blockNumber: parseInt(log.blockNumber, 16),
          logIndex: parseInt(log.logIndex, 16),
          contractName,
        });
      }
    } catch {
      // Log doesn't match this contract's interface
    }
  }
  return events;
}

/**
 * Queries contract state via RPC (eth_call) for verification.
 * @param {ethers.JsonRpcProvider} provider
 * @param {string} contractAddress
 * @param {string} abiFragment - Minimal ABI for the call
 * @param {string} functionSignature - e.g. "getRecord(uint256)"
 * @param {any[]} args - Function arguments
 * @returns {Promise<any>} Decoded result
 */
async function queryContractState(provider, contractAddress, abiFragment, functionSignature, args = []) {
  const iface = new ethers.Interface([abiFragment]);
  const data = iface.encodeFunctionData(functionSignature, args);

  const result = await provider.call({
    to: contractAddress,
    data,
  });

  return iface.decodeFunctionResult(functionSignature, result);
}

/**
 * Verifies deployed contracts via Etherscan API and RPC.
 *
 * @param {object} options
 * @param {string} options.apiKey - Etherscan API key
 * @param {string} options.chainEntryAddr - ChainEntry contract address
 * @param {string} options.chainLinkAddr - ChainLink contract address
 * @param {string} options.chainTerminalAddr - ChainTerminal contract address
 * @param {number} options.chainId - Target chain ID
 * @param {string} options.rpcUrl - JSON-RPC URL for state queries
 * @param {string} options.studentName - Student name for report
 * @returns {Promise<object>} Verification report
 */
async function verifyOnEtherscan({
  apiKey,
  chainEntryAddr,
  chainLinkAddr,
  chainTerminalAddr,
  chainId,
  rpcUrl,
  studentName = "etherscan-verify",
}) {
  const errors = [];
  let eventCheck = { pass: false, received: [], errors: [] };
  let stateCheck = { pass: false, record: null, errors: [] };

  try {
    // Fetch events for all three contracts
    console.log("  Fetching events from Etherscan...");

    const [entryLogs, linkLogs, terminalLogs] = await Promise.all([
      fetchContractEvents(apiKey, chainEntryAddr, chainId),
      chainLinkAddr ? fetchContractEvents(apiKey, chainLinkAddr, chainId) : Promise.resolve([]),
      fetchContractEvents(apiKey, chainTerminalAddr, chainId),
    ]);

    console.log(`    ChainEntry:   ${entryLogs.length} logs`);
    console.log(`    ChainLink:    ${linkLogs.length} logs`);
    console.log(`    ChainTerminal: ${terminalLogs.length} logs`);

    // Decode events using each contract's standard ABI
    const entryIface = new ethers.Interface([
      "event ChainStarted(uint256 indexed chainId, address indexed initiator, bytes data)",
      "event EntryExecuted(uint256 indexed chainId, address indexed nextLink)",
    ]);

    const linkIface = chainLinkAddr ? new ethers.Interface([
      "event LinkExecuted(uint256 indexed chainId, uint256 indexed stepNumber, address indexed nextLink, bytes transformedData)",
      "event LinkValidationFailed(uint256 indexed chainId, string reason)",
    ]) : null;

    const terminalIface = new ethers.Interface([
      "event FinalReceived(address indexed from, uint256 indexed chainId, bytes data, uint256 timestamp)",
      "event ChainCompleted(uint256 indexed chainId, bytes32 dataHash)",
    ]);

    const allEvents = [
      ...decodeEtherscanLogs(entryLogs, entryIface, "ChainEntry"),
      ...(linkIface ? decodeEtherscanLogs(linkLogs, linkIface, "ChainLink") : []),
      ...decodeEtherscanLogs(terminalLogs, terminalIface, "ChainTerminal"),
    ];

    // Sort by transaction hash then log index for temporal ordering
    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return a.logIndex - b.logIndex;
    });

    eventCheck = verifyEventOrder(allEvents);
    if (eventCheck.pass) {
      console.log("  ✓ Event order verified via Etherscan:", eventCheck.received.join(" → "));
    } else {
      console.error("  ✗ Event order mismatch:", eventCheck.errors.join("; "));
      errors.push(...eventCheck.errors.map((e) => `[Etherscan Events] ${e}`));
    }

    // ── State Verification via RPC ──
    if (rpcUrl) {
      console.log("  Querying contract state via RPC...");
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      try {
        const recordResult = await queryContractState(
          provider,
          chainTerminalAddr,
          {
            type: "function",
            name: "getRecord",
            inputs: [{ name: "chainId", type: "uint256" }],
            outputs: [
              { name: "", type: "uint256" },
              { name: "", type: "bytes" },
              { name: "", type: "bytes32" },
              { name: "", type: "uint256" },
              { name: "", type: "bool" },
            ],
          },
          "getRecord(uint256)",
          [1]
        );

        // Check if record exists
        const exists = recordResult[4];
        if (exists) {
          // Verify data prefix
          const dataHex = recordResult[1];
          const dataStr = ethers.toUtf8String(dataHex);

          if (dataStr.startsWith("[VALIDATED]")) {
            console.log("  ✓ Final state verified: data starts with [VALIDATED]");
            stateCheck = { pass: true, record: recordResult, errors: [] };
          } else {
            const msg = `Stored data does not start with [VALIDATED]. Got: "${dataStr.slice(0, 50)}..."`;
            console.error("  ✗", msg);
            stateCheck = { pass: false, record: recordResult, errors: [msg] };
            errors.push(`[Etherscan State] ${msg}`);
          }

          if (recordResult[3] === 0n) {
            const msg = "Record timestamp is zero";
            stateCheck.errors.push(msg);
            errors.push(`[Etherscan State] ${msg}`);
          }
        } else {
          const msg = "Record for chainId 1 does not exist";
          console.error("  ✗", msg);
          stateCheck = { pass: false, record: recordResult, errors: [msg] };
          errors.push(`[Etherscan State] ${msg}`);
        }
      } catch (err) {
        const msg = `RPC state query failed: ${err.message}`;
        console.error("  ✗", msg);
        stateCheck = { pass: false, record: null, errors: [msg] };
        errors.push(`[Etherscan State] ${msg}`);
      }
    } else {
      console.log("  Skipping state verification (no RPC URL provided)");
    }
  } catch (err) {
    errors.push(`Etherscan verification error: ${err.message}`);
    console.error("  ✗ Etherscan verification error:", err.message);
  }

  const passed = eventCheck.pass && stateCheck.pass;

  return {
    student: studentName,
    platform: "ethereum",
    mode: "etherscan",
    score: passed ? 100 : 0,
    maxScore: 100,
    passed,
    breakdown: {
      eventChain: {
        passed: eventCheck.pass,
        events: eventCheck.received,
        errors: eventCheck.errors,
      },
      finalState: {
        passed: stateCheck.pass,
        errors: stateCheck.errors,
      },
    },
    addresses: {
      chainEntry: chainEntryAddr,
      chainLink: chainLinkAddr || "N/A",
      chainTerminal: chainTerminalAddr,
    },
    network: {
      chainId,
      explorer: EXPLORER_URLS[chainId] || "unknown",
      rpcUrl: rpcUrl || "N/A",
    },
    errors,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { verifyOnEtherscan, EXPLORER_URLS, fetchContractEvents, decodeEtherscanLogs };