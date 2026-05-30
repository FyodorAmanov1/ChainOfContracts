# Remix Deployment Guide — Generic Chain of Contracts (Ethereum)

## Prerequisites
- Browser with [Remix IDE](https://remix.ethereum.org/) open
- MetaMask installed (or use Remix VM for testing)

## Step 1: Create the Workspace
1. Open Remix IDE
2. Create a new workspace: "ChainOfContracts"
3. Create the following files (copy from `ethereum/contracts/`):
   - `contracts/IChainEntry.sol`
   - `contracts/IChainLink.sol`
   - `contracts/IChainTerminal.sol`
   - `contracts/ChainEntry.sol`
   - `contracts/ChainLink.sol`
   - `contracts/ChainTerminal.sol`

## Step 2: Compile
1. Open the Solidity Compiler tab (second icon)
2. Select compiler version `0.8.24`
3. Enable "Auto compile"
4. Select `ChainEntry.sol` — it will compile all dependencies

## Step 3: Deploy — ChainTerminal (Final Store)
1. Open the Deploy & Run Transactions tab (third icon)
2. Environment: Remix VM (Cancun) or Injected Provider (MetaMask)
3. Select `ChainTerminal` from the contract dropdown
4. Click **Deploy**
5. Copy the deployed address — you'll need it for ChainLink(3)

## Step 4: Deploy — ChainLink(3) (Processor — third link)
1. Select `ChainLink` from the contract dropdown
2. In the deploy field, enter the step number: `3`
3. Click **Deploy**
4. Expand ChainLink(3) in "Deployed Contracts"
5. Call `setNextLink` with ChainTerminal's address
6. Copy ChainLink(3)'s address — you'll need it for ChainLink(2)

## Step 5: Deploy — ChainLink(2) (Processor — second link)
1. Select `ChainLink` from the contract dropdown
2. In the deploy field, enter the step number: `2`
3. Click **Deploy**
4. Expand ChainLink(2) in "Deployed Contracts"
5. Call `setNextLink` with ChainLink(3)'s address
6. Copy ChainLink(2)'s address — you'll need it for ChainLink(1)

## Step 6: Deploy — ChainLink(1) (Processor — first link)
1. Select `ChainLink` from the contract dropdown
2. In the deploy field, enter the step number: `1`
3. Click **Deploy**
4. Expand ChainLink(1) in "Deployed Contracts"
5. Call `setNextLink` with ChainLink(2)'s address
6. Copy ChainLink(1)'s address — you'll need it for ChainEntry

## Step 7: Deploy — ChainEntry (Entry Point)
1. Select `ChainEntry` from the contract dropdown
2. Click **Deploy**
3. Expand ChainEntry in "Deployed Contracts"
4. Call `setNextLink` with ChainLink(1)'s address

## Step 8: Wire the Access Control
On ChainLink(1):
1. Call `setPrevLink` with ChainEntry's address

On ChainLink(2):
1. Call `setPrevLink` with ChainLink(1)'s address

On ChainLink(3):
1. Call `setPrevLink` with ChainLink(2)'s address

On ChainTerminal:
1. Call `setPrevLink` with ChainLink(3)'s address

## Step 9: Run the Chain
1. Expand ChainEntry in "Deployed Contracts"
2. Call `startChain` with any data (e.g., `0x48656c6c6f` = "Hello" in hex)
3. Check the transaction log — you should see 7 events:
   - `ChainStarted`
   - `EntryExecuted`
   - `LinkExecuted`
   - `LinkExecuted`
   - `LinkExecuted`
   - `FinalReceived`
   - `ChainCompleted`

## Step 10: Verify
1. In ChainTerminal, call `getRecord` with the chain ID (returned by `startChain`, likely 1)
2. The stored data should start with `[VALIDATED][VALIDATED][VALIDATED]`
3. Call `getRecordCount` to see total records stored
4. In each ChainLink, call `getExecution` with the same chain ID

## Adding More Links (N > 3)

For a chain deeper than the minimum 5 contracts:

1. Deploy ChainTerminal → get address T
2. Deploy ChainLink(step=N) → setNextLink(T) → get address Lₙ
3. Deploy ChainLink(step=N-1) → setNextLink(Lₙ) → get address Lₙ₋₁
4. ... continue for each link ...
5. Deploy ChainLink(step=1) → setNextLink(L₂) → get address L₁
6. Deploy ChainEntry → setNextLink(L₁) → get address E
7. Wire each ChainLink(i): setPrevLink(Lᵢ₋₁) for i>1, ChainLink(1).setPrevLink(E)
8. ChainTerminal.setPrevLink(Lₙ)
9. Call E.startChain(data)

Each link will prepend `[VALIDATED]` to the data. After N links, the stored data will be `[VALIDATED]^N<original_data>`.

## Expected Event Order (Minimum Depth — 5 Contracts)
```
ChainStarted → EntryExecuted → LinkExecuted → LinkExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

## Expected Event Order (N-Link Chain)
```
ChainStarted → EntryExecuted → LinkExecuted(1) → ... → LinkExecuted(N) → FinalReceived → ChainCompleted
```

## Deployment Order Summary
```
1. Deploy ChainTerminal       → address T
2. Deploy ChainLink(step=3)   → setNextLink(T)     → address L₃
3. Deploy ChainLink(step=2)   → setNextLink(L₃)    → address L₂
4. Deploy ChainLink(step=1)   → setNextLink(L₂)    → address L₁
5. Deploy ChainEntry          → setNextLink(L₁)    → address E
6. ChainLink(1).setPrevLink(E)
7. ChainLink(2).setPrevLink(L₁)
8. ChainLink(3).setPrevLink(L₂)
9. ChainTerminal.setPrevLink(L₃)
10. Call Entry.startChain(data) → chain executes!
```

## Troubleshooting

| Error | Likely Cause |
|-------|-------------|
| `NextLink not set` | Call `setNextLink` on ChainEntry |
| `Only prevLink can call this` | Call `setPrevLink` on ChainLink (set to the previous link's address) |
| `Only prevLink can call this` (Terminal) | Call `setPrevLink` on ChainTerminal (set to Link(3)'s address) |
| `Chain forwarding failed` | Link → next link broken — check NextLink wiring and gas |