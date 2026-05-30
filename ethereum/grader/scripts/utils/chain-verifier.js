const { ethers } = require("ethers");

/**
 * Expected event order for a generic chain of contracts.
 * For a 3-contract chain (Entry + 1 Link + Terminal):
 *   ChainStarted → EntryExecuted → LinkExecuted → FinalReceived → ChainCompleted
 *
 * For an N-link chain:
 *   ChainStarted → EntryExecuted → LinkExecuted(1) → ... → LinkExecuted(N) → FinalReceived → ChainCompleted
 */
const EXPECTED_EVENT_ORDER = [
  "ChainStarted",
  "EntryExecuted",
  "LinkExecuted",
  "FinalReceived",
  "ChainCompleted",
];

/**
 * Verifies that emitted events appear in the expected order.
 * Accepts either the default event order or a custom order for multi-link chains.
 * @param {ethers.EventLog[]} logs - Parsed event logs from the transaction receipt
 * @param {string[]} expectedOrder - Ordered list of expected event names
 * @returns {{ pass: boolean, received: string[], errors: string[] }}
 */
function verifyEventOrder(logs, expectedOrder = EXPECTED_EVENT_ORDER) {
  const errors = [];
  const receivedNames = logs.map((l) => l.eventName || l.event);

  // Filter to only known/expected events
  const filtered = receivedNames.filter((name) => expectedOrder.includes(name));
  const expected = expectedOrder.filter((name) => filtered.includes(name));

  for (let i = 0; i < Math.min(filtered.length, expected.length); i++) {
    if (filtered[i] !== expected[i]) {
      errors.push(
        `Position ${i}: expected "${expected[i]}", got "${filtered[i]}"`
      );
    }
  }

  if (filtered.length < expected.length) {
    const missing = expected
      .slice(filtered.length)
      .filter((e) => !filtered.includes(e));
    errors.push(`Missing events: ${missing.join(", ")}`);
  }

  // Check that chain ends with ChainCompleted
  if (!receivedNames.includes("ChainCompleted")) {
    errors.push("Chain did not complete — no ChainCompleted event");
  }

  return {
    pass: errors.length === 0,
    received: receivedNames,
    errors,
  };
}

/**
 * Verifies the final state stored in ChainTerminal matches expectations.
 * @param {ethers.Contract} chainTerminal - Instance of ChainTerminal
 * @param {number} chainId - The chain ID to verify
 * @param {string} expectedDataPrefix - Expected prefix in stored data (e.g. "[VALIDATED]")
 * @returns {{ pass: boolean, record: object|null, errors: string[] }}
 */
async function verifyFinalState(chainTerminal, chainId, expectedDataPrefix = "[VALIDATED]") {
  const errors = [];
  let record = null;

  try {
    record = await chainTerminal.getRecord(chainId);

    const exists = record[4];
    if (!exists) {
      errors.push(`Record for chainId ${chainId} does not exist`);
      return { pass: false, record, errors };
    }

    const storedData = ethers.toUtf8String(record[1]);
    if (!storedData.startsWith(expectedDataPrefix)) {
      errors.push(
        `Data does not start with expected prefix "${expectedDataPrefix}". Got: "${storedData.slice(0, 50)}..."`
      );
    }

    if (record[3] === 0n) {
      errors.push("Timestamp is zero — record may not have been written properly");
    }

    // Verify non-zero hash
    if (record[2] === ethers.ZeroHash) {
      errors.push("Data hash is zero — hash was not computed");
    }
  } catch (err) {
    errors.push(`Failed to query ChainTerminal: ${err.message}`);
  }

  return {
    pass: errors.length === 0,
    record,
    errors,
  };
}

/**
 * Extracts parsed event logs from a transaction receipt.
 * @param {ethers.Contract} contract - Contract instance to filter with
 * @param {ethers.TransactionReceipt} receipt - Transaction receipt
 * @returns {ethers.EventLog[]} Parsed event logs
 */
function extractEvents(contract, receipt) {
  try {
    const events = [];
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        if (parsed) {
          events.push({ eventName: parsed.name, args: parsed.args, ...parsed });
        }
      } catch {
        // Skip logs that don't belong to this contract's interface
      }
    }
    return events;
  } catch (err) {
    console.error("Error extracting events:", err.message);
    return [];
  }
}

module.exports = { verifyEventOrder, verifyFinalState, extractEvents, EXPECTED_EVENT_ORDER };