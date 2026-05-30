# Ethereum Solution — Generic Chain of Contracts

## Architecture (Minimum Depth 5)

```
User → ChainEntry → ChainLink(step=1) → ChainLink(step=2) → ChainLink(step=3) → ChainTerminal
```

Each contract implements a generic interface and calls the next via a unified `receiveFinal` selector.

### Design Patterns

1. **Linked-list cross-contract calls** — each contract references its neighbours through generic interfaces (`IChainLink`, `IChainTerminal`), not through named contract-specific interfaces. This allows any number of links between Entry and Terminal.

2. **Unified forwarding interface** — ChainLink forwards to the next contract by calling `receiveFinal(chainId, bytes)` via a low-level `call`. Since both ChainLink and ChainTerminal implement `receiveFinal` with the same signature, the forwarding is uniform regardless of the target type.

3. **Access control** — `onlyOwner` protects setter functions; `onlyPrevLink` guards cross-contract entry points. Each contract validates that only its configured predecessor can call its processing methods.

4. **Event-driven verification** — each step emits events:
   - ChainEntry: `ChainStarted`, `EntryExecuted`
   - ChainLink: `LinkExecuted` (or `LinkValidationFailed` on error)
   - ChainTerminal: `FinalReceived`, `ChainCompleted`

### Key Differences from Original (v1.0)

| Aspect | v1.0 (A→B→C) | v2.0 (Generic Linked List) |
|--------|---------------|---------------------------|
| Interface | `IContractA/B/C` — specific per contract | `IChainEntry/Link/Terminal` — generic roles |
| Min chain depth | Fixed 3 contracts | 5 contracts (Entry + 3 Links + Terminal) |
| Forwarding | Named methods per contract | Uniform `receiveFinal` selector |
| Access control | `onlyContractA/B` — named | `onlyPrevLink` — generic |
| Data transformation | ContractB adds `[VALIDATED]` | Each ChainLink adds `[VALIDATED]` |

### Deployment Order (Minimum Depth 5)

```
 1. Deploy ChainTerminal            → T
 2. Deploy ChainLink(step=3)        → setNextLink(T)    → L₃
 3. Deploy ChainLink(step=2)        → setNextLink(L₃)   → L₂
 4. Deploy ChainLink(step=1)        → setNextLink(L₂)   → L₁
 5. Deploy ChainEntry               → setNextLink(L₁)   → E
 6. ChainLink(1).setPrevLink(E)
 7. ChainLink(2).setPrevLink(L₁)
 8. ChainLink(3).setPrevLink(L₂)
 9. ChainTerminal.setPrevLink(L₃)
10. Call ChainEntry.startChain(data)
```

### N-Link Deployment (N > 3)

For Entry → Link₁ → Link₂ → ... → Linkₙ → Terminal:

```
1. Deploy ChainTerminal             → T
2. Deploy ChainLink(N).setNextLink(T)  → Lₙ
3. Deploy ChainLink(N-1).setNextLink(Lₙ) → Lₙ₋₁
...
4. Deploy ChainLink(1).setNextLink(L₂) → L₁
5. Deploy ChainEntry.setNextLink(L₁) → E
6. For i=2..N: ChainLink(i).setPrevLink(Lᵢ₋₁)
7. ChainLink(1).setPrevLink(E)
8. ChainTerminal.setPrevLink(Lₙ)
9. E.startChain(data)
```

### Events (Minimum Depth — 3 Links)

```
ChainStarted → EntryExecuted → LinkExecuted → LinkExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

### Expected State Output

```
ChainTerminal.getRecord(1) → {
  chainId: 1,
  data: 0x5b56414c4944415445445d5b56414c4944415445445d5b56414c4944415445445d... = "[VALIDATED][VALIDATED][VALIDATED]<original_data>",
  dataHash: 0x...,
  timestamp: <block_timestamp>,
  exists: true
}
```