/**
 * Generates structured grading reports for the Chain of Contracts lab.
 */

/**
 * Creates a grading report for a student's Ethereum submission.
 * @param {{
 *   studentName: string,
 *   compileOk: boolean,
 *   compileErrors: string[],
 *   deployOk: boolean,
 *   deployErrors: string[],
 *   eventOrder: { pass: boolean, received: string[], errors: string[] },
 *   finalState: { pass: boolean, record: object|null, errors: string[] },
 *   gasUsed: bigint|null,
 * }} input
 * @returns {object} Structured report
 */
function generateReport(input) {
  const {
    studentName,
    compileOk,
    compileErrors,
    deployOk,
    deployErrors,
    eventOrder,
    finalState,
    gasUsed,
  } = input;

  // Scoring weights
  const COMPILE_WEIGHT = 0.2;    // 20%
  const DEPLOY_WEIGHT = 0.3;     // 30%
  const EVENT_WEIGHT = 0.3;      // 30%
  const STATE_WEIGHT = 0.2;      // 20%

  let compileScore = compileOk ? COMPILE_WEIGHT * 100 : 0;
  let deployScore = deployOk ? DEPLOY_WEIGHT * 100 : 0;
  let eventScore = eventOrder.pass ? EVENT_WEIGHT * 100 : (eventOrder.errors.length > 0 ? EVENT_WEIGHT * 50 : 0);
  let stateScore = finalState.pass ? STATE_WEIGHT * 100 : 0;

  let totalScore = compileScore + deployScore + eventScore + stateScore;

  const errors = [];
  if (!compileOk) errors.push(...compileErrors.map((e) => `[Compile] ${e}`));
  if (!deployOk) errors.push(...deployErrors.map((e) => `[Deploy] ${e}`));
  if (!eventOrder.pass) errors.push(...eventOrder.errors.map((e) => `[Events] ${e}`));
  if (!finalState.pass) errors.push(...finalState.errors.map((e) => `[State] ${e}`));

  const report = {
    student: studentName,
    platform: "ethereum",
    score: Math.round(totalScore * 100) / 100,
    maxScore: 100,
    passed: totalScore >= 70,
    breakdown: {
      compilation: { score: compileScore, max: COMPILE_WEIGHT * 100, passed: compileOk },
      deployment: { score: deployScore, max: DEPLOY_WEIGHT * 100, passed: deployOk },
      eventChain: { score: eventScore, max: EVENT_WEIGHT * 100, passed: eventOrder.pass },
      finalState: { score: stateScore, max: STATE_WEIGHT * 100, passed: finalState.pass },
    },
    gasUsed: gasUsed ? gasUsed.toString() : "N/A",
    errors,
    timestamp: new Date().toISOString(),
  };

  return report;
}

/**
 * Merges multiple student reports into a summary.
 * @param {object[]} reports - Array of individual reports
 * @returns {object} Summary
 */
function generateSummary(reports) {
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.length - passed;

  return {
    totalStudents: reports.length,
    passed,
    failed,
    passRate: reports.length > 0 ? Math.round((passed / reports.length) * 10000) / 100 : 0,
    averageScore: reports.length > 0
      ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length * 100) / 100
      : 0,
    reports,
  };
}

module.exports = { generateReport, generateSummary };