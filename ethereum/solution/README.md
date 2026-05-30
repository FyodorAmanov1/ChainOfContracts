# Ethereum Solution — Generic Chain of Contracts

## Architecture

```
User → ChainEntry → ChainLink(step=1) → ChainTerminal
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
| Chain length | Fixed 3 contracts | Arbitrary (N links) |
| Forwarding | Named methods per contract | Uniform `receiveFinal` selector |
| Access control | `onlyContractA/B` — named | `onlyPrevLink` — generic |
| Data transformation | ContractB adds `[VALIDATED]` | Each ChainLink adds `[VALIDATED]` |

### Deployment Order

```
1. Deploy ChainTerminal      → get address T
2. Deploy ChainLink(step=1)  → get address L
3. Deploy ChainEntry         → get address E
4. ChainTerminal.setPrevLink(L)
5. ChainLink.setNextLink(T)
6. ChainLink.setPrevLink(E)
7. ChainEntry.setNextLink(L)
8. Call ChainEntry.startChain(data)
```

### N-Link Deployment

For Entry → Link₁ → Link₂ → ... → Linkₙ → Terminal:

```
1. Deploy ChainTerminal          → T
2. Deploy ChainLink(N).setNextLink(T) → Lₙ
3. Deploy ChainLink(N-1).setNextLink(Lₙ) → Lₙ₋₁
...
4. Deploy ChainLink(1).setNextLink(L₂) → L₁
5. Deploy ChainEntry.setNextLink(L₁) → E
6. For i=2..N: ChainLink(i).setPrevLink(Lᵢ₋₁)
7. ChainLink(1).setPrevLink(E)
8. ChainTerminal.setPrevLink(Lₙ)
9. E.startChain(data)
```

### Events (1-link chain)

```
ChainStarted → EntryExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

### Expected State Output

```
ChainTerminal.getRecord(1) → {
  chainId: 1,
  data: 0x5b56414c4944415445445d... = "[VALIDATED]<original_data>",
  dataHash: 0x...,
  timestamp: <block_timestamp>,
  exists: true
}
```