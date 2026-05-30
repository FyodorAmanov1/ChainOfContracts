# Polkadot Solution — Generic Chain of Contracts

## Architecture

```
User → ChainEntry → ChainLink(step=1) → ChainTerminal
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
| Chain length | Fixed 3 | Arbitrary (N links) |
| Forwarding | Named selectors per contract | Uniform `receive_final` selector |

### ink! vs Solidity Implementation Notes

| Feature | Solidity | ink! |
|---------|----------|------|
| Forward call | `addr.call(abi.encodeWithSignature("receiveFinal(...)", ...))` | `build_call::<DefaultEnvironment>().call(addr).exec_input(ExecutionInput::new(Selector::new(ink::selector_bytes!("receive_final"))))` |
| Access control | `modifier onlyPrevLink() { require(msg.sender == prevLink, ...); _; }` | `fn ensure_prev_link(&self) { assert_eq!(self.env().caller(), self.prev_link, ...); }` |
| Events | `emit EventName(args)` | `self.env().emit_event(EventName { ... })` |
| Hashing | `keccak256(data)` | `self.env().hash_bytes::<ink::H256>(&data)` |

### Deployment Order

```
1. Build & deploy ChainTerminal      → T
2. Build & deploy ChainLink(step=1)  → L (setNextLink=T)
3. Build & deploy ChainEntry         → E (setNextLink=L)
4. ChainLink.setPrevLink(E)
5. ChainTerminal.setPrevLink(L)
6. Entry.startChain(data)
```

### Events (1-link chain)

```
ChainStarted → EntryExecuted → LinkExecuted → FinalReceived → ChainCompleted
```