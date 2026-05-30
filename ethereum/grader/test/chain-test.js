const { expect } = require("chai");
const { ethers } = require("hardhat");
const { verifyEventOrder, verifyFinalState, EXPECTED_EVENT_ORDER } = require("../scripts/utils/chain-verifier");

describe("Chain of Contracts (Ethereum) — Generic Chain", function () {
  let chainEntry, chainLink, chainTerminal;
  let deployer;
  const TEST_DATA = ethers.toUtf8Bytes("TestChainData");

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    // Deploy in reverse dependency order: Terminal → Link → Entry
    chainTerminal = await ethers.deployContract("ChainTerminal");
    await chainTerminal.waitForDeployment();

    chainLink = await ethers.deployContract("ChainLink", [1]);
    await chainLink.waitForDeployment();

    chainEntry = await ethers.deployContract("ChainEntry");
    await chainEntry.waitForDeployment();

    // Wire contracts together
    const eAddr = await chainEntry.getAddress();
    const lAddr = await chainLink.getAddress();
    const tAddr = await chainTerminal.getAddress();

    await chainTerminal.setPrevLink(lAddr);
    await chainLink.setNextLink(tAddr);
    await chainLink.setPrevLink(eAddr);
    await chainEntry.setNextLink(lAddr);
  });

  describe("Deployment", function () {
    it("should deploy all three contracts", async function () {
      expect(await chainEntry.getAddress()).to.be.properAddress;
      expect(await chainLink.getAddress()).to.be.properAddress;
      expect(await chainTerminal.getAddress()).to.be.properAddress;
    });

    it("should set owner correctly", async function () {
      expect(await chainEntry.owner()).to.equal(deployer.address);
      expect(await chainLink.owner()).to.equal(deployer.address);
      expect(await chainTerminal.owner()).to.equal(deployer.address);
    });

    it("should have correct contract addresses wired", async function () {
      expect(await chainEntry.nextLink()).to.equal(await chainLink.getAddress());
      expect(await chainLink.nextLink()).to.equal(await chainTerminal.getAddress());
      expect(await chainLink.prevLink()).to.equal(await chainEntry.getAddress());
      expect(await chainLink.stepNumber()).to.equal(1);
    });
  });

  describe("Chain Execution", function () {
    it("should execute the full Entry→Link→Terminal chain successfully", async function () {
      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      // Verify chain counter incremented
      expect(await chainEntry.chainCounter()).to.equal(1);

      // Verify receipt completed
      const [chainId, initiator, data, completed] = await chainEntry.getReceipt(1);
      expect(chainId).to.equal(1);
      expect(initiator).to.equal(deployer.address);
      expect(completed).to.be.true;

      // Verify execution count
      expect(await chainLink.executionCount()).to.equal(1);
      expect(await chainLink.getExecutionCount()).to.equal(1);

      // Verify final record in Terminal
      const [cChainId, cData, cHash, cTimestamp, cExists] = await chainTerminal.getRecord(1);
      expect(cChainId).to.equal(1);
      expect(cExists).to.be.true;
      expect(cTimestamp).to.be.gt(0);
    });

    it("should emit all events in correct generic order", async function () {
      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      const logs = receipt.logs.map((log) => {
        for (const contract of [chainEntry, chainLink, chainTerminal]) {
          try {
            const parsed = contract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            if (parsed) {
              return { eventName: parsed.name, args: parsed.args, logIndex: log.index };
            }
          } catch {}
        }
        return { eventName: "UNKNOWN", args: [], logIndex: log.index };
      }).filter((e) => e.eventName !== "UNKNOWN");

      const result = verifyEventOrder(logs);
      expect(result.pass, `Event order incorrect: ${result.errors.join("; ")}`).to.be.true;
      expect(result.received).to.deep.equal(EXPECTED_EVENT_ORDER);
    });

    it("should store validated data with [VALIDATED] prefix", async function () {
      await chainEntry.startChain(TEST_DATA);

      const result = await verifyFinalState(chainTerminal, 1, "[VALIDATED]");
      expect(result.pass, `Final state incorrect: ${result.errors.join("; ")}`).to.be.true;

      const [, storedData] = result.record;
      const decoded = ethers.toUtf8String(storedData);
      expect(decoded).to.equal("[VALIDATED]TestChainData");
    });

    it("should support multiple chain executions", async function () {
      await chainEntry.startChain(TEST_DATA);
      await chainEntry.startChain(ethers.toUtf8Bytes("SecondChain"));

      expect(await chainEntry.chainCounter()).to.equal(2);
      expect(await chainTerminal.recordCount()).to.equal(2);
    });

    it("should support an arbitrarily long chain via multiple links", async function () {
      // Deploy a second link and a new terminal
      const chainLink2 = await ethers.deployContract("ChainLink", [2]);
      await chainLink2.waitForDeployment();
      const chainTerminal2 = await ethers.deployContract("ChainTerminal");
      await chainTerminal2.waitForDeployment();

      const eAddr = await chainEntry.getAddress();
      const l1Addr = await chainLink.getAddress();
      const l2Addr = await chainLink2.getAddress();
      const t2Addr = await chainTerminal2.getAddress();

      // Wire: Entry → Link1 → Link2 → Terminal2
      await chainEntry.setNextLink(l1Addr);
      await chainLink.setNextLink(l2Addr);
      await chainLink.setPrevLink(eAddr);
      await chainLink2.setNextLink(t2Addr);
      await chainLink2.setPrevLink(l1Addr);
      await chainTerminal2.setPrevLink(l2Addr);

      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      // Verify events for 2-link chain
      const logs = receipt.logs.map((log) => {
        for (const contract of [chainEntry, chainLink, chainLink2, chainTerminal2]) {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            if (parsed) return { eventName: parsed.name, args: parsed.args, logIndex: log.index };
          } catch {}
        }
        return { eventName: "UNKNOWN", args: [], logIndex: log.index };
      }).filter((e) => e.eventName !== "UNKNOWN");

      const expected2LinkOrder = [
        "ChainStarted",
        "EntryExecuted",
        "LinkExecuted",
        "LinkExecuted", // second link
        "FinalReceived",
        "ChainCompleted",
      ];

      expect(logs.map((l) => l.eventName)).to.deep.equal(expected2LinkOrder);
      expect(await chainTerminal2.recordCount()).to.equal(1);
    });
  });

  describe("Access Control", function () {
    it("should reject non-owner setNextLink calls on Entry", async function () {
      const [, other] = await ethers.getSigners();
      const instance = chainEntry.connect(other);
      await expect(instance.setNextLink(ethers.Wallet.createRandom().address))
        .to.be.revertedWith("Only owner can call this");
    });

    it("should reject non-owner setNextLink calls on Link", async function () {
      const [, other] = await ethers.getSigners();
      const instance = chainLink.connect(other);
      await expect(instance.setNextLink(ethers.Wallet.createRandom().address))
        .to.be.revertedWith("Only owner can call this");
    });

    it("should reject non-owner setPrevLink calls on Terminal", async function () {
      const [, other] = await ethers.getSigners();
      const instance = chainTerminal.connect(other);
      await expect(instance.setPrevLink(ethers.Wallet.createRandom().address))
        .to.be.revertedWith("Only owner can call this");
    });
  });

  describe("Error Handling", function () {
    it("should reject empty data", async function () {
      await expect(chainEntry.startChain("0x"))
        .to.be.revertedWith("Data cannot be empty");
    });

    it("should reject startChain when nextLink is not set", async function () {
      const orphanEntry = await ethers.deployContract("ChainEntry");
      await orphanEntry.waitForDeployment();

      await expect(orphanEntry.startChain(TEST_DATA))
        .to.be.revertedWith("NextLink not set");
    });

    it("should reject non-prevLink calls to processAndForward", async function () {
      await expect(chainLink.processAndForward(1, TEST_DATA))
        .to.be.revertedWith("Only prevLink can call this");
    });

    it("should reject non-prevLink calls to receiveFinal on Terminal", async function () {
      await expect(chainTerminal.receiveFinal(1, TEST_DATA))
        .to.be.revertedWith("Only prevLink can call this");
    });
  });
});