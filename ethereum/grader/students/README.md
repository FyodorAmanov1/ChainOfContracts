# Student Submissions — Ethereum

## Directory Structure

Place each student's Solidity files in a subdirectory named after them:

```
students/
├── student_name/
│   ├── ChainEntry.sol
│   ├── ChainLink.sol
│   └── ChainTerminal.sol
├── another_student/
│   ├── ChainEntry.sol
│   └── ...
└── ...
```

## Grading Pipeline

1. **Copy** → Files are copied from the student directory into the grader
2. **Compile** → Hardhat compiles all 6 `.sol` files (3 contracts + 3 interfaces)
3. **Deploy** → ChainTerminal → ChainLink → ChainEntry, then wired via setter calls
4. **Execute** → `ChainEntry.startChain(data)` runs the full chain
5. **Verify** → Event order and final state in ChainTerminal are checked
6. **Report** → JSON report written to `output/<student_name>-eth-report.json`

## Expected Events (in order)

```
ChainStarted → EntryExecuted → LinkExecuted → FinalReceived → ChainCompleted
```

## Scoring

| Phase | Weight | Requirement |
|-------|--------|-------------|
| Compilation | 20% | All 3 contracts compile without errors |
| Deployment | 30% | All contracts deploy, wire, and execute |
| Event Chain | 30% | All 5 events in correct order |
| Final State | 20% | ChainTerminal stores record with `[VALIDATED]` prefix |

**Pass threshold: 70%**