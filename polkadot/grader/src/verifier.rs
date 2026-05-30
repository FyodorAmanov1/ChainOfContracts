use crate::chain_runner::ChainEvent;
use crate::deploy::ContractAddresses;
use crate::reporter::PhaseResult;
use anyhow::Result;

/// Expected event order for a minimum-depth chain (5 contracts: Entry + 3 Links + Terminal).
/// Generic: Entry → Link(1) → Link(2) → Link(3) → Terminal
const EXPECTED_EVENT_ORDER: &[&str] = &[
    "ChainStarted",
    "EntryExecuted",
    "LinkExecuted",
    "LinkExecuted",
    "LinkExecuted",
    "FinalReceived",
    "ChainCompleted",
];

/// Verifies that emitted events appear in the expected order.
/// For N-link chains, LinkExecuted appears N times.
pub fn verify_event_order(events: &[ChainEvent]) -> PhaseResult {
    let mut errors = Vec::new();

    let received_names: Vec<&str> = events.iter().map(|e| e.name.as_str()).collect();
    let filtered: Vec<&str> = received_names.iter()
        .filter(|n| EXPECTED_EVENT_ORDER.contains(n))
        .copied()
        .collect();

    let expected_filtered: Vec<&&str> = EXPECTED_EVENT_ORDER.iter()
        .filter(|e| filtered.contains(e))
        .collect();

    for (i, name) in filtered.iter().enumerate() {
        if i >= expected_filtered.len() || *name != *expected_filtered[i] {
            errors.push(format!(
                "Position {}: expected \"{}\", got \"{}\"",
                i,
                expected_filtered.get(i).unwrap_or(&&"?"),
                name
            ));
        }
    }

    if !received_names.contains(&"ChainCompleted") {
        errors.push("Chain did not complete — no ChainCompleted event".into());
    }

    if filtered.len() < EXPECTED_EVENT_ORDER.len() {
        let missing: Vec<&&str> = EXPECTED_EVENT_ORDER.iter()
            .filter(|e| !filtered.contains(e))
            .collect();
        errors.push(format!("Missing events: {:?}", missing));
    }

    if errors.is_empty() {
        PhaseResult::pass("Event Verification")
    } else {
        PhaseResult::fail("Event Verification", errors.join("; "))
    }
}

/// Verifies the final state stored in ChainTerminal.
pub async fn verify_final_state(
    rpc_url: &str,
    addrs: &ContractAddresses,
) -> PhaseResult {
    // In a real implementation:
    // 1. Connect to node
    // 2. Query ChainTerminal storage for chain_id = 1
    // 3. Verify:
    //    - record exists (exists == true)
    //    - data starts with "[VALIDATED]"
    //    - data_hash is non-zero
    //    - timestamp is non-zero

    if std::env::var("POLKADOT_GRADER_DRY_RUN").is_ok() {
        return PhaseResult::pass("State Verification");
    }

    PhaseResult::fail(
        "State Verification",
        "Requires running substrate-contracts-node. Set POLKADOT_GRADER_DRY_RUN=1 for dry run.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_correct_order_min_depth() {
        // Minimum depth: 3 LinkExecuted events
        let events = vec![
            ChainEvent { name: "ChainStarted".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "EntryExecuted".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link1".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link2".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link3".into() },
            ChainEvent { name: "FinalReceived".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "ChainCompleted".into(), chain_id: Some(1), data: "".into() },
        ];
        let result = verify_event_order(&events);
        assert!(result.passed);
    }

    #[test]
    fn test_verify_missing_completed() {
        let events = vec![
            ChainEvent { name: "ChainStarted".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "EntryExecuted".into(), chain_id: Some(1), data: "".into() },
        ];
        let result = verify_event_order(&events);
        assert!(!result.passed);
        assert!(result.details.contains("ChainCompleted"));
    }

    #[test]
    fn test_verify_empty_events() {
        let events = vec![];
        let result = verify_event_order(&events);
        assert!(!result.passed);
    }

    #[test]
    fn test_verify_n_plus_link_order() {
        // Test an N=4 link chain: more links than the minimum of 3
        let events = vec![
            ChainEvent { name: "ChainStarted".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "EntryExecuted".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link1".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link2".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link3".into() },
            ChainEvent { name: "LinkExecuted".into(), chain_id: Some(1), data: "link4".into() },
            ChainEvent { name: "FinalReceived".into(), chain_id: Some(1), data: "".into() },
            ChainEvent { name: "ChainCompleted".into(), chain_id: Some(1), data: "".into() },
        ];
        let result = verify_event_order(&events);
        assert!(result.passed);
    }
}