const { expect } = require("chai");
const { ethers } = require("hardhat");
const { verifyEventOrder, verifyFinalState, EXPECTED_EVENT_ORDER } = require("../scripts/utils/chain-verifier");

describe("Chain of Contracts (Ethereum) — Minimum Depth 5", function () {
  let chainEntry, chainLink1, chainLink2, chainLink3, chainTerminal;
  let deployer;
  const TEST_DATA = ethers.toUtf8Bytes("TestChainData");

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    // Deploy in reverse dependency order: Terminal → Link(3) → Link(2) → Link(1) → Entry
    chainTerminal = await ethers.deployContract("ChainTerminal");
    await chainTerminal.waitForDeployment();

    chainLink3 = await ethers.deployContract("ChainLink", [3]);
    await chainLink3.waitForDeployment();

    chainLink2 = await ethers.deployContract("ChainLink", [2]);
    await chainLink2.waitForDeployment();

    chainLink1 = await ethers.deployContract("ChainLink", [1]);
    await chainLink1.waitForDeployment();

    chainEntry = await ethers.deployContract("ChainEntry");
    await chainEntry.waitForDeployment();

    // Wire contracts: Entry → Link1 → Link2 → Link3 → Terminal
    const eAddr = await chainEntry.getAddress();
    const l1Addr = await chainLink1.getAddress();
    const l2Addr = await chainLink2.getAddress();
    const l3Addr = await chainLink3.getAddress();
    const tAddr = await chainTerminal.getAddress();

    await chainLink3.setNextLink(tAddr);
    await chainLink3.setPrevLink(l2Addr);
    await chainLink2.setNextLink(l3Addr);
    await chainLink2.setPrevLink(l1Addr);
    await chainLink1.setNextLink(l2Addr);
    await chainLink1.setPrevLink(eAddr);
    await chainTerminal.setPrevLink(l3Addr);
    await chainEntry.setNextLink(l1Addr);
  });

  describe("Deployment", function () {
    it("should deploy all five contracts", async function () {
      expect(await chainEntry.getAddress()).to.be.properAddress;
      expect(await chainLink1.getAddress()).to.be.properAddress;
      expect(await chainLink2.getAddress()).to.be.properAddress;
      expect(await chainLink3.getAddress()).to.be.properAddress;
      expect(await chainTerminal.getAddress()).to.be.properAddress;
    });

    it("should set owner correctly", async function () {
      expect(await chainEntry.owner()).to.equal(deployer.address);
      expect(await chainLink1.owner()).to.equal(deployer.address);
      expect(await chainLink2.owner()).to.equal(deployer.address);
      expect(await chainLink3.owner()).to.equal(deployer.address);
      expect(await chainTerminal.owner()).to.equal(deployer.address);
    });

    it("should have correct contract addresses wired", async function () {
      expect(await chainEntry.nextLink()).to.equal(await chainLink1.getAddress());
      expect(await chainLink1.nextLink()).to.equal(await chainLink2.getAddress());
      expect(await chainLink2.nextLink()).to.equal(await chainLink3.getAddress());
      expect(await chainLink3.nextLink()).to.equal(await chainTerminal.getAddress());
      expect(await chainLink1.prevLink()).to.equal(await chainEntry.getAddress());
      expect(await chainLink2.prevLink()).to.equal(await chainLink1.getAddress());
      expect(await chainLink3.prevLink()).to.equal(await chainLink2.getAddress());
      expect(await chainLink1.stepNumber()).to.equal(1);
      expect(await chainLink2.stepNumber()).to.equal(2);
      expect(await chainLink3.stepNumber()).to.equal(3);
    });
  });

  describe("Chain Execution", function () {
    it("should execute the full 5-contract chain successfully", async function () {
      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      // Verify chain counter incremented
      expect(await chainEntry.chainCounter()).to.equal(1);

      // Verify receipt completed
      const [chainId, initiator, data, completed] = await chainEntry.getReceipt(1);
      expect(chainId).to.equal(1);
      expect(initiator).to.equal(deployer.address);
      expect(completed).to.be.true;

      // Verify each link's execution count
      expect(await chainLink1.executionCount()).to.equal(1);
      expect(await chainLink2.executionCount()).to.equal(1);
      expect(await chainLink3.executionCount()).to.equal(1);

      // Verify final record in Terminal
      const [cChainId, cData, cHash, cTimestamp, cExists] = await chainTerminal.getRecord(1);
      expect(cChainId).to.equal(1);
      expect(cExists).to.be.true;
      expect(cTimestamp).to.be.gt(0);
    });

    it("should emit all 7 events in correct order (3 x LinkExecuted)", async function () {
      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      const logs = receipt.logs.map((log) => {
        for (const contract of [chainEntry, chainLink1, chainLink2, chainLink3, chainTerminal]) {
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

    it("should store validated data with triple [VALIDATED] prefix", async function () {
      await chainEntry.startChain(TEST_DATA);

      const result = await verifyFinalState(chainTerminal, 1);
      expect(result.pass, `Final state incorrect: ${result.errors.join("; ")}`).to.be.true;

      const [, storedData] = result.record;
      const decoded = ethers.toUtf8String(storedData);
      expect(decoded).to.equal("[VALIDATED][VALIDATED][VALIDATED]TestChainData");
    });

    it("should support multiple chain executions", async function () {
      await chainEntry.startChain(TEST_DATA);
      await chainEntry.startChain(ethers.toUtf8Bytes("SecondChain"));

      expect(await chainEntry.chainCounter()).to.equal(2);
      expect(await chainTerminal.recordCount()).to.equal(2);
    });

    it("should support an even longer chain via additional links", async function () {
      // Deploy a fourth link and a new terminal
      const chainLink4 = await ethers.deployContract("ChainLink", [4]);
      await chainLink4.waitForDeployment();
      const chainTerminal2 = await ethers.deployContract("ChainTerminal");
      await chainTerminal2.waitForDeployment();

      const eAddr = await chainEntry.getAddress();
      const l1Addr = await chainLink1.getAddress();
      const l2Addr = await chainLink2.getAddress();
      const l3Addr = await chainLink3.getAddress();
      const l4Addr = await chainLink4.getAddress();
      const t2Addr = await chainTerminal2.getAddress();

      // Wire: Entry → Link1 → Link2 → Link3 → Link4 → Terminal2
      await chainEntry.setNextLink(l1Addr);
      await chainLink1.setNextLink(l2Addr);
      await chainLink1.setPrevLink(eAddr);
      await chainLink2.setNextLink(l3Addr);
      await chainLink2.setPrevLink(l1Addr);
      await chainLink3.setNextLink(l4Addr);
      await chainLink3.setPrevLink(l2Addr);
      await chainLink4.setNextLink(t2Addr);
      await chainLink4.setPrevLink(l3Addr);
      await chainTerminal2.setPrevLink(l4Addr);

      const tx = await chainEntry.startChain(TEST_DATA);
      const receipt = await tx.wait();

      // Verify events for 4-link chain
      const logs = receipt.logs.map((log) => {
        for (const contract of [chainEntry, chainLink1, chainLink2, chainLink3, chainLink4, chainTerminal2]) {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            if (parsed) return { eventName: parsed.name, args: parsed.args, logIndex: log.index };
          } catch {}
        }
        return { eventName: "UNKNOWN", args: [], logIndex: log.index };
      }).filter((e) => e.eventName !== "UNKNOWN");

      const expected4LinkOrder = [
        "ChainStarted",
        "EntryExecuted",
        "LinkExecuted",
        "LinkExecuted",
        "LinkExecuted",
        "LinkExecuted", // fourth link
        "FinalReceived",
        "ChainCompleted",
      ];

      expect(logs.map((l) => l.eventName)).to.deep.equal(expected4LinkOrder);
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
      const instance = chainLink1.connect(other);
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
      await expect(chainLink1.processAndForward(1, TEST_DATA))
        .to.be.revertedWith("Only prevLink can call this");
    });

    it("should reject non-prevLink calls to receiveFinal on Terminal", async function () {
      await expect(chainTerminal.receiveFinal(1, TEST_DATA))
        .to.be.revertedWith("Only prevLink can call this");
    });
  });
});