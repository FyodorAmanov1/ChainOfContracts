# Contracts UI Deployment Guide — Generic Chain of Contracts (Polkadot)

## Prerequisites
- [Polkadot.js browser extension](https://polkadot.js.org/extension/) installed
- Access to [Contracts UI](https://contracts-ui.substrate.io/) (or local instance)
- A local Substrate node with `pallet-contracts` (e.g., `substrate-contracts-node`)
- `cargo contract` CLI installed (`cargo install cargo-contract --force`)

## Step 1: Build Contracts

```bash
# Build each contract
cd polkadot/contracts/chain_terminal
cargo contract build --release

cd ../chain_link
cargo contract build --release

cd ../chain_entry
cargo contract build --release
```

Each build produces a `.contract` bundle in `target/ink/`.

## Step 2: Start Local Node

```bash
# Install and run the contracts node
cargo install contracts-node --git https://github.com/paritytech/substrate-contracts-node.git
substrate-contracts-node --dev --tmp
```

## Step 3: Upload and Instantiate — ChainTerminal

1. Open Contracts UI and connect to `ws://127.0.0.1:9944`
2. Click **Add New Contract**
3. Select `chain_terminal/target/ink/chain_terminal.contract`
4. Click **Upload & Instantiate**
5. Constructor: `new()`
6. No constructor arguments
7. Set a name: "ChainTerminal"
8. Click **Create** and sign the transaction
9. Copy the deployed address (T)

## Step 4: Upload and Instantiate — ChainLink(3)

1. Click **Add New Contract**
2. Select `chain_link/target/ink/chain_link.contract`
3. Constructor: `new(step_number: u32)` — enter `3`
4. Name: "ChainLink(3)"
5. Click **Create**
6. After instantiation:
   - Call `setNextLink` with ChainTerminal's address (T)
7. Copy ChainLink(3)'s address (L₃)

## Step 5: Upload and Instantiate — ChainLink(2)

1. Click **Add New Contract**
2. Select `chain_link/target/ink/chain_link.contract`
3. Constructor: `new(step_number: u32)` — enter `2`
4. Name: "ChainLink(2)"
5. Click **Create**
6. After instantiation:
   - Call `setNextLink` with ChainLink(3)'s address (L₃)
7. Copy ChainLink(2)'s address (L₂)

## Step 6: Upload and Instantiate — ChainLink(1)

1. Click **Add New Contract**
2. Select `chain_link/target/ink/chain_link.contract`
3. Constructor: `new(step_number: u32)` — enter `1`
4. Name: "ChainLink(1)"
5. Click **Create**
6. After instantiation:
   - Call `setNextLink` with ChainLink(2)'s address (L₂)
7. Copy ChainLink(1)'s address (L₁)

## Step 7: Upload and Instantiate — ChainEntry

1. Click **Add New Contract**
2. Select `chain_entry/target/ink/chain_entry.contract`
3. Constructor: `new()`
4. Name: "ChainEntry"
5. Click **Create**
6. After instantiation:
   - Call `setNextLink` with ChainLink(1)'s address (L₁)

## Step 8: Wire Access Control

1. On ChainLink(1): call `setPrevLink` with ChainEntry's address (E)
2. On ChainLink(2): call `setPrevLink` with ChainLink(1)'s address (L₁)
3. On ChainLink(3): call `setPrevLink` with ChainLink(2)'s address (L₂)
4. On ChainTerminal: call `setPrevLink` with ChainLink(3)'s address (L₃)

## Step 9: Run the Chain

1. Select ChainEntry in the UI
2. Call `startChain` with any hex data (e.g., `0x48656c6c6f`)
3. Sign and submit the transaction
4. Check the event log for 7 events:
   - `ChainStarted`
   - `EntryExecuted`
   - `LinkExecuted` × 3
   - `FinalReceived`
   - `ChainCompleted`

## Step 10: Verify

- **ChainTerminal → getRecord(1)**: data should start with `[VALIDATED][VALIDATED][VALIDATED]`
- **ChainTerminal → recordCount()**: Should be 1
- **ChainLink(1) → executionCount()**: Should be 1
- **ChainLink(2) → executionCount()**: Should be 1
- **ChainLink(3) → executionCount()**: Should be 1

## Adding More Links (N > 3)

For a chain deeper than the minimum 5 contracts:

1. Deploy ChainTerminal
2. Deploy ChainLink(N) with `step_number: N`, set `nextLink = Terminal`
3. Deploy ChainLink(N-1) with `step_number: N-1`, set `nextLink = Link(N)`
4. Continue backwards for each link
5. Deploy ChainLink(1) with `step_number: 1`, set `nextLink = Link(2)`, set `prevLink = Entry`
6. Deploy ChainEntry, set `nextLink = Link(1)`
7. For each ChainLink(i>1), call `setPrevLink` with ChainLink(i-1)'s address
8. Call `setPrevLink` on ChainTerminal with Link(N)'s address
9. Call `ChainEntry.startChain(data)`

## Deployment Order Summary

```
1. Build & deploy ChainTerminal  → get address T
2. Build & deploy ChainLink(3)   → setNextLink(T)  → get address L₃
3. Build & deploy ChainLink(2)   → setNextLink(L₃) → get address L₂
4. Build & deploy ChainLink(1)   → setNextLink(L₂) → get address L₁
5. Build & deploy ChainEntry     → setNextLink(L₁) → get address E
6. ChainLink(1).setPrevLink(E)
7. ChainLink(2).setPrevLink(L₁)
8. ChainLink(3).setPrevLink(L₂)
9. ChainTerminal.setPrevLink(L₃)
10. Call Entry.startChain(data) → chain executes!
```

## Troubleshooting

| Error | Likely Cause |
|-------|-------------|
| `PrevLink not set` | Forgot to call `setPrevLink` on a ChainLink |
| `Only prevLink can call this` | Wrong address in `setPrevLink` |
| `NextLink not set` | Forgot to call `setNextLink` on ChainEntry |
| Out of gas | Increase `gas_limit` in the cross-contract call |