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
5. Copy the deployed address — you'll need it for ChainLink

## Step 4: Deploy — ChainLink (Processor)
1. Select `ChainLink` from the contract dropdown
2. In the deploy field next to the Deploy button, enter the step number: `1`
3. Click **Deploy**
4. Expand ChainLink in "Deployed Contracts"
5. Call `setNextLink` with ChainTerminal's address
6. Copy ChainLink's address — you'll need it for ChainEntry

## Step 5: Deploy — ChainEntry (Entry Point)
1. Select `ChainEntry` from the contract dropdown
2. Click **Deploy**
3. Expand ChainEntry in "Deployed Contracts"
4. Call `setNextLink` with ChainLink's address

## Step 6: Wire the Access Control
On ChainLink:
1. Call `setPrevLink` with ChainEntry's address

On ChainTerminal:
1. Call `setPrevLink` with ChainLink's address

## Step 7: Run the Chain
1. Expand ChainEntry in "Deployed Contracts"
2. Call `startChain` with any data (e.g., `0x48656c6c6f` = "Hello" in hex)
3. Check the transaction log — you should see events:
   - `ChainStarted`
   - `EntryExecuted`
   - `LinkExecuted`
   - `FinalReceived`
   - `ChainCompleted`

## Step 8: Verify
1. In ChainTerminal, call `getRecord` with the chain ID (returned by `startChain`, likely 1)
2. Call `getRecordCount` to see total records stored
3. In ChainLink, call `getExecution` with the same chain ID

## Adding More Links (N-Link Chain)

For a longer chain (Entry → Link₁ → Link₂ → ... → Linkₙ → Terminal):

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

## Expected Event Order (1-Link Chain)
```
ChainStarted → EntryExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

## Expected Event Order (N-Link Chain)
```
ChainStarted → EntryExecuted → LinkExecuted(1) → ... → LinkExecuted(N) → FinalReceived → ChainCompleted
```

## Deployment Order Summary
```
1. Deploy ChainTerminal      → setPrevLink(Link)
2. Deploy ChainLink(step=1)  → setNextLink(Terminal), setPrevLink(Entry)
3. Deploy ChainEntry         → setNextLink(Link)
4. Call Entry.startChain(data) → chain executes!
```

## Troubleshooting

| Error | Likely Cause |
|-------|-------------|
| `NextLink not set` | Call `setNextLink` on ChainEntry |
| `Only prevLink can call this` | Call `setPrevLink` on ChainLink (set to Entry's address) |
| `Only prevLink can call this` (Terminal) | Call `setPrevLink` on ChainTerminal (set to Link's address) |
| `Chain forwarding failed` | Link→Terminal link broken — check NextLink and gas |