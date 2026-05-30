# Polkadot Student Submission Directory

Place each student's contract directories in a subdirectory named after the student.

## Structure

```
students/
├── student_name/
│   ├── chain_entry/
│   │   ├── Cargo.toml
│   │   └── lib.rs
│   ├── chain_link/
│   │   ├── Cargo.toml
│   │   └── lib.rs
│   └── chain_terminal/
│       ├── Cargo.toml
│       └── lib.rs
└── ...
```

The grader will:
1. Build each contract with `cargo contract build`
2. Upload and instantiate on a local substrate node
3. Execute the generic chain (Entry → Link → Terminal)
4. Verify events and final state
5. Generate a JSON report per student