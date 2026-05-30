const fs = require("fs");
const path = require("path");

/**
 * Merges Ethereum and Polkadot reports into a combined student result.
 *
 * @param {object} ethReport - Ethereum grading report
 * @param {object} polkadotReport - Polkadot grading report
 * @param {object} config - Grading configuration
 * @returns {object} Merged report
 */
function mergeReports(ethReport, polkadotReport, config) {
  const ethWeight = config.labInfo.ethereumWeight || 0.5;
  const polkadotWeight = config.labInfo.polkadotWeight || 0.5;

  const ethScore = ethReport.score || 0;
  const polkadotScore = polkadotReport.score || 0;

  const combinedScore = Math.round(
    (ethScore * ethWeight + polkadotScore * polkadotWeight) * 100
  ) / 100;

  const passThreshold = config.grading.passThreshold || 70;

  const studentName = ethReport.student || polkadotReport.student || "unknown";

  const allErrors = [
    ...(ethReport.errors || []).map((e) => `[Ethereum] ${e}`),
    ...(polkadotReport.errors || []).map((e) => `[Polkadot] ${e}`),
  ];

  return {
    student: studentName,
    combinedScore,
    maxScore: 100,
    passed: combinedScore >= passThreshold,
    ethereum: ethReport,
    polkadot: polkadotReport,
    errors: allErrors,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generates a CSV summary from an array of merged reports.
 *
 * @param {object[]} reports - Array of merged reports
 * @param {string} outputPath - Path to write the CSV file
 */
function generateCsvSummary(reports, outputPath) {
  const header = "Student,Ethereum Score,Polkadot Score,Combined Score,Passed,Errors\n";
  const rows = reports.map((r) => {
    const ethScore = r.ethereum?.score ?? "N/A";
    const polkadotScore = r.polkadot?.score ?? "N/A";
    const errors = r.errors.length > 0 ? `"${r.errors.join("; ")}"` : "";
    return `${r.student},${ethScore},${polkadotScore},${r.combinedScore},${r.passed},${errors}`;
  });

  const csv = header + rows.join("\n") + "\n";
  fs.writeFileSync(outputPath, csv, "utf-8");
  console.log(`CSV summary written to: ${outputPath}`);
}

/**
 * Generates a summary JSON from an array of merged reports.
 *
 * @param {object[]} reports - Array of merged reports
 * @returns {object} Summary
 */
function generateSummaryJson(reports) {
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.length - passed;
  const avgScore = reports.length > 0
    ? Math.round(reports.reduce((s, r) => s + r.combinedScore, 0) / reports.length * 100) / 100
    : 0;

  return {
    totalStudents: reports.length,
    passed,
    failed,
    passRate: reports.length > 0
      ? Math.round((passed / reports.length) * 10000) / 100
      : 0,
    averageScore: avgScore,
    reports: reports.map((r) => ({
      student: r.student,
      combinedScore: r.combinedScore,
      passed: r.passed,
      ethScore: r.ethereum?.score ?? null,
      polkadotScore: r.polkadot?.score ?? null,
      errorCount: r.errors.length,
    })),
  };
}

module.exports = { mergeReports, generateCsvSummary, generateSummaryJson };