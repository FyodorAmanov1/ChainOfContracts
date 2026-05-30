use serde::Serialize;

/// Result of a single grading phase.
#[derive(Debug, Clone, Serialize)]
pub struct PhaseResult {
    pub phase: String,
    pub passed: bool,
    pub skipped: bool,
    pub details: String,
    pub score: f64,
}

impl PhaseResult {
    pub fn pass(phase: &str) -> Self {
        Self {
            phase: phase.to_string(),
            passed: true,
            skipped: false,
            details: "OK".into(),
            score: 100.0,
        }
    }

    pub fn fail(phase: &str, details: String) -> Self {
        Self {
            phase: phase.to_string(),
            passed: false,
            skipped: false,
            details,
            score: 0.0,
        }
    }

    pub fn skip(phase: &str) -> Self {
        Self {
            phase: phase.to_string(),
            passed: false,
            skipped: true,
            details: "Skipped — previous phase failed".into(),
            score: 0.0,
        }
    }
}

/// Complete grading report for a student's Polkadot submission.
#[derive(Debug, Clone, Serialize)]
pub struct GradingReport {
    pub student: String,
    pub platform: String,
    pub score: f64,
    pub max_score: f64,
    pub passed: bool,
    pub breakdown: Breakdown,
    pub errors: Vec<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Breakdown {
    pub deployment: PhaseResult,
    pub event_chain: PhaseResult,
    pub final_state: PhaseResult,
}

/// Scoring weights
const DEPLOY_WEIGHT: f64 = 0.5;   // 50%
const EVENT_WEIGHT: f64 = 0.3;    // 30%
const STATE_WEIGHT: f64 = 0.2;    // 20%

/// Generates a structured grading report.
pub fn generate_report(
    student_name: &str,
    deployment: PhaseResult,
    event_chain: PhaseResult,
    final_state: PhaseResult,
) -> GradingReport {
    let mut errors = Vec::new();

    if !deployment.passed && !deployment.skipped {
        errors.push(format!("[Deployment] {}", deployment.details));
    }
    if !event_chain.passed && !event_chain.skipped {
        errors.push(format!("[Events] {}", event_chain.details));
    }
    if !final_state.passed && !final_state.skipped {
        errors.push(format!("[State] {}", final_state.details));
    }

    // Calculate weighted score
    let mut score = 0.0;
    for (phase, weight) in [
        (&deployment, DEPLOY_WEIGHT),
        (&event_chain, EVENT_WEIGHT),
        (&final_state, STATE_WEIGHT),
    ] {
        if phase.passed {
            score += weight * 100.0;
        } else if !phase.skipped {
            score += weight * 0.0; // Failed — zero for this component
        }
        // Skipped phases get 0
    }

    let score = (score * 100.0).round() / 100.0;

    GradingReport {
        student: student_name.to_string(),
        platform: "polkadot".into(),
        score,
        max_score: 100.0,
        passed: score >= 70.0,
        breakdown: Breakdown {
            deployment,
            event_chain,
            final_state,
        },
        errors,
        timestamp: chrono_now(),
    }
}

fn chrono_now() -> String {
    // Simple ISO-like timestamp without external chrono crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Format as ISO date (approximate)
    let days = secs / 86400;
    let years = 1970 + (days / 365) as u32;
    let remaining = days % 365;
    let month = 1 + (remaining / 28) as u32; // rough
    let day = 1 + (remaining % 28) as u32;
    format!("{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        years, month, day,
        (secs % 86400) / 3600,
        (secs % 3600) / 60,
        secs % 60)
}