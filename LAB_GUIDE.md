# ChainOfContractsLab

A university blockchain lab where students build and verify **generic chains of contracts** — smart contracts arranged as a linked list where each contract calls the next, forming a verifiable chain of arbitrary length — across **Ethereum** (Solidity) and **Polkadot** (ink!), with a comparative analysis of **TON**.

The chain has a **minimum depth of 5 contracts** — students must create chains of at least `Entry → Link₁ → Link₂ → Link₃ → Terminal` (5 contracts), and can extend to any larger length bounded only by the blockchain's gas/weight limits.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Ethereum (Solidity)](#ethereum-solidity)
- [Polkadot (ink!)](#polkadot-ink)
- [TON Comparison](#ton-comparison)
- [Grading System](#grading-system)
- [Professor Tools](#professor-tools)
- [On-Chain Verification](#on-chain-verification)
- [Quick Start](#quick-start)
- [Running the Lab](#running-the-lab)
- [Prerequisites](#prerequisites)
- [Troubleshooting](#troubleshooting)

---

## Overview

Students implement the **Generic Message Relay Chain** pattern — a configurable linked list `Entry → Link → ... → Terminal` — on two blockchain platforms, learning cross-contract calls, access control, event-driven verification, and platform-specific differences.

| Platform | Language | Environment | Grader |
|----------|----------|-------------|--------|
| Ethereum | Solidity 0.8.24 | Remix IDE / Hardhat | Hardhat + Mocha (Node.js) + Etherscan API |
| Polkadot | ink! 5.0 (Rust) | Contracts UI | Rust CLI (subxt) + Subscan API |
| TON | (analysis only) | LaTeX paper | — |

### What's New (v2.0)

- **Arbitrarily long chains** — the linked-list pattern supports N links between Entry and Terminal, not just the old fixed 3-contract pattern
- **Generic interfaces** — `IChainEntry`, `IChainLink`, `IChainTerminal` replace the old `IContractA/B/C` pattern
- **On-chain verification** — the professor's grader now works with Etherscan (Ethereum) and Subscan (Polkadot) to verify contracts deployed on real testnets/mainnets
- **Remix-first** — all Solidity contracts are explicitly designed for Remix IDE deployment

---

## Architecture

### Generic Chain Pattern

```
User --startChain(data)--> ChainEntry --processAndForward()--> ChainLink(1) --receiveFinal()--> ... --receiveFinal()--> ChainLink(N) --receiveFinal()--> ChainTerminal
```

Each contract has a single, well-defined role in the linked list:

| Contract | Interface | Role | Key Behaviour |
|----------|-----------|------|---------------|
| **ChainEntry** | IChainEntry | Entry point | Stores a `ChainReceipt`, emits `ChainStarted` and `EntryExecuted`, forwards to the first ChainLink |
| **ChainLink** | IChainLink | Processor | Validates data, prepends `[VALIDATED]` marker, emits `LinkExecuted`, forwards to next link or terminal |
| **ChainTerminal** | IChainTerminal | Final store | Accepts only from the last ChainLink, stores a `FinalRecord` with hash + timestamp, emits `FinalReceived` and `ChainCompleted` |

Any number of `ChainLink` contracts can be inserted between the Entry and the Terminal.

### Minimum Chain Depth (5 contracts)

The lab requires a chain with **at least 3 ChainLink contracts** between Entry and Terminal:

```
User → ChainEntry → ChainLink(1) → ChainLink(2) → ChainLink(3) → ChainTerminal
```

This is the minimum acceptable chain. Students can (and are encouraged to) add more links for extra depth.

### Events (exact order for minimum-depth 5-contract chain)

```
ChainStarted → EntryExecuted → LinkExecuted → LinkExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

For N links, `LinkExecuted` appears N times in positions 3 through N+2.

### Data Flow

1. User calls `ChainEntry.startChain(data)` with arbitrary bytes
2. ChainEntry stores a receipt, emits events, calls `ChainLink.processAndForward(chainId, data)`
3. ChainLink validates the data (non-empty, ≤ 1024 bytes), prepends `[VALIDATED]`, emits `LinkExecuted`, calls `receiveFinal` on the next contract
4. Each subsequent ChainLink does the same — validation, transformation, forwarding
5. The last ChainLink calls `ChainTerminal.receiveFinal(chainId, transformedData)`
6. ChainTerminal stores the final record (data + keccak256/blake2b hash + timestamp)
7. The chain completes atomically — if any step fails, the entire transaction reverts

### Deployment Wiring

Contracts must be deployed and wired in reverse dependency order. For the minimum-depth 5-contract chain:

```
 1. Deploy ChainTerminal            → get address T
 2. Deploy ChainLink(step=3)        → setNextLink(T)     → get address L₃
 3. Deploy ChainLink(step=2)        → setNextLink(L₃)    → get address L₂
 4. Deploy ChainLink(step=1)        → setNextLink(L₂)    → get address L₁
 5. Deploy ChainEntry               → setNextLink(L₁)    → get address E
 6. ChainLink(1).setPrevLink(E)
 7. ChainLink(2).setPrevLink(L₁)
 8. ChainLink(3).setPrevLink(L₂)
 9. ChainTerminal.setPrevLink(L₃)
10. Call E.startChain(data)         → chain executes atomically
```

For the old default (3-contract) chain, deploy ChainLink(1) directly connected to Terminal.

---

## Directory Structure

```
ChainOfContractsLab/
├── ethereum/
│   ├── contracts/                    # Generic Solidity implementation
│   │   ├── ChainEntry.sol
│   │   ├── ChainLink.sol
│   │   ├── ChainTerminal.sol
│   │   ├── IChainEntry.sol
│   │   ├── IChainLink.sol
│   │   └── IChainTerminal.sol
│   ├── grader/                       # Automated Hardhat grader
│   │   ├── contracts/                # Copy of reference contracts (graded)
│   │   ├── scripts/
│   │   │   ├── grade.js              # Main grading script
│   │   │   └── utils/
│   │   │       ├── chain-verifier.js # Event order & state verification
│   │   │       ├── etherscan-verifier.js # Etherscan on-chain verification
│   │   │       └── report-generator.js   # JSON report generation
│   │   ├── test/
│   │   │   └── chain-test.js         # Mocha unit tests
│   │   ├── students/                 # Place student .sol files here
│   │   │   └── README.md
│   │   ├── output/                   # Generated grading reports
│   │   ├── hardhat.config.js
│   │   └── package.json
│   ├── solution/
│   │   └── README.md                 # Solution explanation
│   └── remix/
│       └── remix-deploy-guide.md     # Step-by-step Remix deployment
│
├── polkadot/
│   ├── contracts/                    # Generic ink! implementation
│   │   ├── chain_entry/
│   │   │   ├── Cargo.toml
│   │   │   └── lib.rs
│   │   ├── chain_link/
│   │   │   ├── Cargo.toml
│   │   │   └── lib.rs
│   │   └── chain_terminal/
│   │       ├── Cargo.toml
│   │       └── lib.rs
│   ├── traits/                       # Generic ink! trait definitions
│   │   ├── IChainEntry.rs
│   │   ├── IChainLink.rs
│   │   └── IChainTerminal.rs
│   ├── grader/                       # Automated Rust grader
│   │   ├── src/
│   │   │   ├── main.rs               # CLI entry point
│   │   │   ├── deploy.rs             # Contract deployment logic
│   │   │   ├── chain_runner.rs       # Chain execution wrapper
│   │   │   ├── verifier.rs           # Event & state verification
│   │   │   ├── subscan_verifier.rs   # Subscan on-chain verification
│   │   │   └── reporter.rs           # Report generation
│   │   ├── students/                 # Place student submissions here
│   │   │   └── README.md
│   │   └── Cargo.toml
│   ├── contracts-ui/
│   │   └── deploy-guide.md           # Polkadot Contracts UI deployment
│   └── solution/
│       └── README.md                 # Solution explanation
│
├── ton-comparison/                   # LaTeX academic paper
│   ├── main.tex
│   ├── references.bib
│   ├── sections/
│   │   ├── 01-async-vs-sync.tex
│   │   ├── 02-gas-model.tex
│   │   ├── 03-actor-vs-account.tex
│   │   ├── 04-language-comparison.tex
│   │   └── 05-practical-tradeoffs.tex
│   └── ton-code-snippets/
│       └── simple-forwarder.fc
│
├── instructions/
│   └── lab-instructions.tex          # Student lab handout (LaTeX)
│
├── professor-tools/                  # Master grading orchestrator
│   ├── lib/
│   │   ├── ethereum-grader.js        # Spawns Hardhat grader / Etherscan verifier
│   │   ├── polkadot-grader.js        # Spawns Rust grader / Subscan verifier
│   │   └── report-merger.js          # Merges cross-platform results
│   ├── sample-submissions/           # Student contract directories
│   ├── output/                       # Aggregated grading output
│   │   └── README.md
│   ├── config.json                   # Grading configuration
│   ├── run-grading.js                # Main orchestrator entry point
│   └── package.json
│
├── shared/
│   └── diagrams/
│       └── chain-flow.puml           # PlantUML sequence diagram
│
└── README.md                         # This file
```

---

## Ethereum (Solidity)

### Reference Contracts

Located in `ethereum/contracts/`, written in Solidity 0.8.24 with the optimizer enabled (200 runs).

**Key Solidity patterns demonstrated:**
- **Generic linked-list pattern** — each contract references its neighbours through generic interfaces (`IChainLink`, `IChainTerminal`), not through named contract-specific interfaces
- **Access control modifiers** — `onlyOwner` protects setter functions; `onlyPrevLink` guards cross-contract entry points
- **Unified forwarding interface** — all contracts forward via `receiveFinal(chainId, bytes)` for a uniform calling convention
- **Event-driven architecture** — each step emits events that the grader captures from transaction logs
- **EIP-55 compliant addressing** — `address(0)` check prevents misconfiguration

### Deploying via Remix IDE

Follow the step-by-step guide at `ethereum/remix/remix-deploy-guide.md`. The short version:

1. Open [Remix IDE](https://remix.ethereum.org/)
2. Create files for all 6 `.sol` files in `contracts/`
3. Compile with Solidity 0.8.24
4. Deploy in order: `ChainTerminal` → `ChainLink(step=3)` → `ChainLink(step=2)` → `ChainLink(step=1)` → `ChainEntry`
5. Wire addresses via setter functions (each link's `setNextLink`, `setPrevLink`, and `ChainTerminal.setPrevLink`)
6. Call `ChainEntry.startChain(data)` and inspect events

### Running Tests

```bash
cd ethereum/grader
npm install
npx hardhat test
```

The test suite (`ethereum/grader/test/chain-test.js`) covers:
- Deployment and wiring correctness for a minimum-depth 5-contract chain
- Full chain execution with 3 LinkExecuted events (event order, final state, validation prefix)
- N-link chain support (test configures Entry → Link₁ → Link₂ → Terminal)
- Multiple chain executions (2 consecutive runs)
- Access control (non-owner rejected, non-prevLink rejected)
- Error handling (empty data, unset nextLink)

---

## Polkadot (ink!)

### Reference Contracts

Located in `polkadot/contracts/`, written in ink! 5.0 (Rust). Each contract is a separate `cargo` project.

**Key ink! patterns demonstrated:**
- **Generic linked-list pattern** — each contract calls the next via a uniform `receive_final` selector
- **Cross-contract calls** via `build_call::<DefaultEnvironment>()` with `Selector`
- **Access control** with `ensure_prev_link()` and `ensure_owner()` guards
- **Event emission** via `self.env().emit_event(EventName { ... })`
- **Hashing** — ink! uses blake2b by default (configurable), compared to Ethereum's keccak256

### Ink! vs Solidity Comparison

| Aspect | Ethereum (Solidity) | Polkadot (ink!) |
|--------|-------------------|-----------------|
| Cross-contract call | `IChainLink(addr).processAndForward(...)` | `build_call::<DefaultEnvironment>().call(addr).exec_input(...)` |
| Events | `emit EventName(args)` | `self.env().emit_event(EventName { ... })` |
| Hashing | `keccak256` | `blake2b` |
| Access control | `modifier` | `assert_eq!(caller, expected)` |
| Storage | `mapping` | `ink::storage::Mapping` |
| Deployment | Bytecode + constructor | Upload code blob + instantiate |
| Std lib | Full std | `#![no_std]` with `ink::prelude` |

### Deploying via Contracts UI

Follow the guide at `polkadot/contracts-ui/deploy-guide.md`. The short version:

1. Build each contract: `cargo contract build --release`
2. Start a local node: `substrate-contracts-node --dev --tmp`
3. Open [Contracts UI](https://contracts-ui.substrate.io/) connected to `ws://127.0.0.1:9944`
4. Upload & instantiate in order: ChainTerminal → ChainLink → ChainEntry
5. Wire addresses via setter calls
6. Call `ChainEntry.startChain(data)` and verify events

---

## TON Comparison

The `ton-comparison/` directory contains a LaTeX academic paper comparing TON's architecture against Ethereum and Polkadot across five dimensions:

| Section | Topic |
|---------|-------|
| 01 | Asynchronous vs synchronous execution models |
| 02 | Gas models: TON's credit-based vs EVM's prepaid |
| 03 | Actor model vs Account model |
| 04 | Language comparison: FunC/Fift vs Solidity vs ink! |
| 05 | Practical tradeoffs and when each platform excels |

To compile the paper:

```bash
cd ton-comparison
pdflatex main.tex
biber main
pdflatex main.tex
```

---

## Grading System

### Ethereum Grader

The Hardhat-based grader (`ethereum/grader/scripts/grade.js`) runs in 5 phases:

| Phase | Weight | What It Checks |
|-------|--------|----------------|
| 1. Compilation | 20% | All 6 contracts compile without errors (Entry + 3 Links + Terminal + interfaces) |
| 2. Deployment | 30% | Contracts deploy and wire correctly (setter calls succeed) |
| 3. Event Chain | 30% | All 7 events emitted in correct order: `ChainStarted → EntryExecuted → LinkExecuted(1) → LinkExecuted(2) → LinkExecuted(3) → FinalReceived → ChainCompleted` |
| 4. Final State | 20% | ChainTerminal stores record with `[VALIDATED][VALIDATED][VALIDATED]` prefix and non-zero timestamp |

**Pass threshold: 70%**

To grade a single submission:

```bash
cd ethereum/grader
# Place student .sol files in students/<student_name>/

STUDENT_NAME=<student_name> npx hardhat run scripts/grade.js --network hardhat
```

### Polkadot Grader

The Rust-based grader (`polkadot/grader/src/main.rs`) uses `clap` for CLI argument parsing:

| Phase | Weight | What It Checks |
|-------|--------|----------------|
| 1. Deployment | 50% | Build, upload, instantiate, and wire all 6 contracts (Entry + 3 Links + Terminal) |
| 2. Event Chain | 30% | All 7 events in correct order (3 × LinkExecuted) |
| 3. Final State | 20% | ChainTerminal stores record correctly with `[VALIDATED]` triple prefix |

**Pass threshold: 70%**

```bash
cd polkadot/grader
cargo build --release

# Dry run (no node required):

POLKADOT_GRADER_DRY_RUN=1 ./target/release/polkadot-grader \
  --student-dir ./students/student_name \
  --name student_name

# Real run (requires running substrate-contracts-node):

./target/release/polkadot-grader \
  --student-dir ./students/student_name \
  --name student_name \
  --rpc-url ws://127.0.0.1:9944 \
  --suri //Alice
```

---

## Professor Tools

The master orchestrator (`professor-tools/run-grading.js`) provides a unified interface to grade both platforms, merge results, verify on-chain deployments, and generate summary reports.

### Configuration

Edit `professor-tools/config.json`:

```json
{
  "ethereum": {
    "rpcUrl": "http://127.0.0.1:8545",
    "network": "hardhat",
    "graderPath": "../ethereum/grader",
    "etherscan": {
      "apiKeyEnv": "ETHERSCAN_API_KEY",
      "defaultChainId": 11155111
    }
  },
  "polkadot": {
    "rpcUrl": "ws://127.0.0.1:9944",
    "graderBinary": "../polkadot/grader/target/release/polkadot-grader",
    "subscan": {
      "apiKeyEnv": "SUBSCAN_API_KEY",
      "defaultNetwork": "westend"
    }
  },
  ...
}
```

### Commands

```bash
cd professor-tools
npm install

# Grade all students on both platforms (local)

node run-grading.js --all

# Grade a specific student

node run-grading.js --student john_doe

# Grade only Ethereum submissions

node run-grading.js --ethereum

# Grade only Polkadot submissions

node run-grading.js --polkadot

# Grade students in parallel

node run-grading.js --all --parallel
```

### On-Chain Verification Commands

```bash
# Verify Ethereum contracts deployed on Sepolia via Etherscan

ETHERSCAN_API_KEY=your_key node run-grading.js \
  --etherscan \
  --chain-entry 0x... \
  --chain-link 0x... \
  --chain-terminal 0x... \
  --chain-id 11155111 \
  --rpc-url https://sepolia.infura.io/v3/...

# Verify Polkadot contracts deployed on Westend via Subscan

SUBSCAN_API_KEY=your_key node run-grading.js \
  --subscan \
  --chain-entry 5... \
  --chain-link 5... \
  --chain-terminal 5... \
  --subscan-network westend
```

### Student Submission Structure

```
professor-tools/sample-submissions/
├── john_doe-eth/                    # Ethereum .sol files
│   ├── ChainEntry.sol
│   ├── ChainLink.sol
│   └── ChainTerminal.sol
└── john_doe-polkadot/               # Polkadot ink! contracts
    ├── chain_entry/
    │   ├── Cargo.toml
    │   └── lib.rs
    ├── chain_link/
    │   ├── Cargo.toml
    │   └── lib.rs
    └── chain_terminal/
        ├── Cargo.toml
        └── lib.rs
```

### Output

- Individual merged reports: `output/<student_name>-merged-report.json`
- Summary: `output/grading-summary.json`
- CSV export: `output/grading-summary.csv`

---

## On-Chain Verification

### Etherscan Verification

The professor can verify contracts that students deployed on public Ethereum testnets (Sepolia, Goerli) without needing the source code locally:

1. Students deploy their contracts on a public testnet via Remix + MetaMask
2. Students submit their deployed contract addresses (not source files)
3. The professor runs the Etherscan verifier with their API key
4. The verifier pulls event logs from Etherscan and contract state via RPC
5. A verification report is generated showing event order and final state correctness

**Requirements:** `ETHERSCAN_API_KEY` environment variable set. Supported chains: Ethereum Mainnet (1), Sepolia (11155111), Goerli (5), Polygon (137), Arbitrum (42161), Optimism (10).

### Subscan Verification

Similarly, the professor can verify Polkadot contracts deployed on Westend or Rococo:

1. Students deploy on a public testnet via Contracts UI
2. Students submit their deployed contract addresses
3. The professor runs the Subscan verifier
4. The verifier pulls contract events from the Subscan API
5. A verification report is generated

**Requirements:** `SUBSCAN_API_KEY` environment variable set.

---

## Quick Start

### Ethereum — Full Pipeline

```bash
# Install dependencies

cd ethereum/grader
npm install

# Run unit tests

npx hardhat test

# Grade the default (reference) contracts

npx hardhat run scripts/grade.js --network hardhat

# View the report

cat output/default-eth-report.json
```

### Polkadot — Full Pipeline

```bash
cd polkadot/grader

# Build the grader

cargo build --release

# Dry run (validates structure without a node)

POLKADOT_GRADER_DRY_RUN=1 ./target/release/polkadot-grader \
  --student-dir ./students \
  --name "test-run"
```

### Professor Tools — Full Pipeline

```bash
cd professor-tools
npm install
node run-grading.js --all
```

---

## Prerequisites

### For Ethereum Contracts

- **Node.js 20+** (required for Hardhat)
- **npm** (ships with Node.js)
- Browser with [Remix IDE](https://remix.ethereum.org/) access (for manual deployment)
- MetaMask browser extension (optional, for testnet deployment)

### For Polkadot Contracts

- **Rust toolchain** (install via [rustup](https://rustup.rs/))
- **cargo-contract** CLI: `cargo install cargo-contract --force`
- **substrate-contracts-node**: `cargo install contracts-node --git https://github.com/paritytech/substrate-contracts-node.git`
- [Polkadot.js browser extension](https://polkadot.js.org/extension/)
- [Contracts UI](https://contracts-ui.substrate.io/) (browser)

### For Professor Tools

- **Node.js 20+**
- All of the above dependencies (both Ethereum and Polkadot graders must be buildable)
- **Etherscan API key** (for on-chain verification): https://etherscan.io/myapikey
- **Subscan API key** (for on-chain verification): https://docs.api.subscan.io/

### For LaTeX Documents

- **LaTeX distribution** (TeX Live 2023+ or MiKTeX)
- **biber** (for bibliography processing)
- **PlantUML** (optional, for diagram generation): `java -jar plantuml.jar shared/diagrams/chain-flow.puml`

---

## Troubleshooting

### Ethereum

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `NextLink not set` | ChainEntry's `nextLink` address is zero | Call `ChainEntry.setNextLink(lAddr)` |
| `Only prevLink can call this` | ChainLink's `prevLink` not set, or wrong caller | Call `ChainLink.setPrevLink(eAddr)` |
| `Chain forwarding failed` | Link → next call reverted | Check gas limit and next contract's address |
| Module not found errors | Dependencies not installed | Run `npm install` in `ethereum/grader/` |
| Solidity version mismatch | Wrong compiler version | Use Solidity 0.8.24 in Remix |
| Etherscan API error | Invalid or missing API key | Set `ETHERSCAN_API_KEY` env var |

### Polkadot

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `cargo contract` not found | `cargo-contract` not installed | `cargo install cargo-contract --force` |
| `PrevLink not set` | Link's prev_link is None | Call `setPrevLink` on ChainLink |
| `Only prevLink can call this` | Wrong caller or prev_link unset | Call `setPrevLink` with correct address |
| Out of gas | Cross-contract gas limit too low | Increase `gas_limit` in `build_call` |
| Connection refused | substrate-contracts-node not running | Start the node: `substrate-contracts-node --dev --tmp` |
| Subscan API error | Invalid or missing API key | Set `SUBSCAN_API_KEY` env var |

### Professor Tools

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| Polkadot grader binary not found | Binary not built | Run `cd polkadot/grader && cargo build --release` |
| Student directory not found | Wrong directory name | Check `sample-submissions/<student_name>-eth/` exists |
| Parallel grading errors | Concurrent node access | Use `--parallel` only with isolated network instances |
| Port already in use | Another node running | Kill existing process or change port in config |

---

## License

Educational use. Provided as-is for university blockchain courses.