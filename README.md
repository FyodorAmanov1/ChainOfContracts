# Chain of Contracts

**Follow one message through a chain of smart contracts and verify every step.**

Chain of Contracts is a university blockchain lab built around a configurable linked-contract pattern. Ethereum and Polkadot implementations let students examine cross-contract calls, predecessor permissions, state transitions and event evidence; a companion paper compares the design with TON's asynchronous model.

## The contract pattern

```text
User → Entry → Link₁ → Link₂ → Link₃ → Terminal
```

Entry starts a message relay, each intermediate link validates and transforms the payload, and Terminal records the result. The assignment requires at least five contracts, while the pattern can be extended with additional links within platform execution limits.

| Component | Responsibility |
|---|---|
| Entry | Accept a request, record a receipt and begin forwarding |
| Link | Check its caller and payload, transform the data and call its successor |
| Terminal | Accept the final message and store a verifiable record |
| Grader | Inspect expected events, state and chain wiring |

## Three platform perspectives

- **Ethereum:** Solidity reference contracts, generic interfaces, a Remix deployment walkthrough and a Hardhat grading environment.
- **Polkadot:** ink! contracts and traits, a Contracts UI walkthrough and Rust grading tools.
- **TON:** a comparative paper and supporting material about asynchronous contract interaction.

The lab asks how a successful relay can be demonstrated, how a malformed chain should fail and which guarantees depend on the execution model.

## Start with Ethereum locally

Use Node.js/npm and the tool versions declared in [ethereum/grader/package.json](ethereum/grader/package.json):

```bash
cd ethereum/grader
npm install
npm run grade
```

The grading command targets Hardhat's local network. For manual contract deployment, start with the [Remix guide](ethereum/remix/remix-deploy-guide.md). For ink!, follow the [Contracts UI guide](polkadot/contracts-ui/deploy-guide.md) and the relevant Cargo manifests.

## Lab guide and repository map

The [complete lab guide](LAB_GUIDE.md) preserves the detailed assignment, minimum chain depth, event ordering, reverse-order deployment wiring, grader usage and troubleshooting.

| Directory | Contents |
|---|---|
| [ethereum](ethereum/) | Solidity contracts, Remix instructions and Hardhat grader |
| [polkadot](polkadot/) | ink! contracts, interfaces and Rust tools |
| [ton-comparison](ton-comparison/) | Comparative paper and supporting sources |
| [professor-tools](professor-tools/) | Cross-platform grading/reporting utilities |
| [shared](shared/) | Shared diagrams and teaching material |

## Scope

This is an educational implementation and verification lab. Explorer-assisted checks require separate network configuration and access. The code and assignment are not a security audit or a production deployment record; use disposable local or testnet environments when exploring the contracts.
