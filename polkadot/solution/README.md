# Polkadot Solution — Generic Chain of Contracts

## Architecture (Minimum Depth 5)

```
User → ChainEntry → ChainLink(step=1) → ChainLink(step=2) → ChainLink(step=3) → ChainTerminal
```

### Design Patterns

1. **Generic linked-list pattern** — each contract calls the next via a uniform `receive_final` selector. Both ChainLink and ChainTerminal implement `receive_final(chain_id, data)`, enabling an arbitrary number of links.

2. **Cross-contract calls via `build_call`** — the ink! equivalent of Solidity's interface-based calls. Uses `Selector::new(ink::selector_bytes!("receive_final"))` for uniform forwarding.

3. **Access control** — `ensure_owner()` protects setters; `ensure_prev_link()` guards entry points. Each contract checks that `self.env().caller()` matches its configured predecessor.

4. **Event-driven verification** — each step emits events via `self.env().emit_event(...)`.

### Key Differences from Original (v1.0)

| Aspect | v1.0 (contract_a/b/c) | v2.0 (Generic) |
|--------|----------------------|----------------|
| Traits | `IContractA/B/C` | `IChainEntry/Link/Terminal` |
| Min chain depth | Fixed 3 | 5 (Entry + 3 Links + Terminal) |
| Forwarding | Named selectors per contract | Uniform `receive_final` selector |

### ink! vs Solidity Implementation Notes

| Feature | Solidity | ink! |
|---------|----------|------|
| Forward call | `addr.call(abi.encodeWithSignature("receiveFinal(...)", ...))` | `build_call::<DefaultEnvironment>().call(addr).exec_input(ExecutionInput::new(Selector::new(ink::selector_bytes!("receive_final"))))` |
| Access control | `modifier onlyPrevLink() { require(msg.sender == prevLink, ...); _; }` | `fn ensure_prev_link(&self) { assert_eq!(self.env().caller(), self.prev_link, ...); }` |
| Events | `emit EventName(args)` | `self.env().emit_event(EventName { ... })` |
| Hashing | `keccak256(data)` | `self.env().hash_bytes::<ink::H256>(&data)` |

### Deployment Order (Minimum Depth 5)

```
 1. Build & deploy ChainTerminal       → T
 2. Build & deploy ChainLink(3)        → setNextLink(T)   → L₃
 3. Build & deploy ChainLink(2)        → setNextLink(L₃)  → L₂
 4. Build & deploy ChainLink(1)        → setNextLink(L₂)  → L₁
 5. Build & deploy ChainEntry          → setNextLink(L₁)  → E
 6. ChainLink(1).setPrevLink(E)
 7. ChainLink(2).setPrevLink(L₁)
 8. ChainLink(3).setPrevLink(L₂)
 9. ChainTerminal.setPrevLink(L₃)
10. Entry.startChain(data)
```

### Events (Minimum Depth — 3 Links)

```
ChainStarted → EntryExecuted → LinkExecuted → LinkExecuted → LinkExecuted → FinalReceived → ChainCompleted
```