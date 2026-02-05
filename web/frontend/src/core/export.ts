/**
 * Export Functions
 * 
 * Functions for exporting simulation results to CSV and other formats.
 */

import type { SimulationSummary } from "./stats";
import type { Matrix } from "./games";

/**
 * Generate CSV content from simulation data
 */
export function generateCSV(
  iterations: number[],
  allGaps: number[][],
  avgGaps: number[]
): string {
  const gameCount = allGaps.length;
  
  // Header
  const headers = ["iteration"];
  for (let i = 0; i < gameCount; i++) {
    headers.push(`game_${i + 1}_gap`);
  }
  headers.push("avg_gap", "karlin_ratio", "theoretical_bound");
  
  const lines = [headers.join(",")];
  
  // Data rows
  for (let idx = 0; idx < iterations.length; idx++) {
    const iter = iterations[idx];
    const row = [iter.toString()];
    
    // Per-game gaps
    for (let g = 0; g < gameCount; g++) {
      const gap = allGaps[g]?.[idx] ?? 0;
      row.push(gap.toExponential(6));
    }
    
    // Average gap
    row.push((avgGaps[idx] ?? 0).toExponential(6));
    
    // Karlin ratio
    const avgGap = avgGaps[idx] ?? 0;
    const karlin = avgGap * Math.sqrt(iter);
    row.push(karlin.toExponential(6));
    
    // Theoretical bound
    const theory = 1 / Math.sqrt(iter);
    row.push(theory.toExponential(6));
    
    lines.push(row.join(","));
  }
  
  return lines.join("\n");
}

/**
 * Generate summary statistics as CSV
 */
export function generateSummaryCSV(summary: SimulationSummary): string {
  const lines = [
    "metric,value",
    `total_iterations,${summary.totalIterations}`,
    `games_count,${summary.gamesCount}`,
    `execution_time_ms,${summary.executionTimeMs.toFixed(2)}`,
    "",
    "gap_statistics,",
    `gap_mean,${summary.gapStats.mean.toExponential(6)}`,
    `gap_median,${summary.gapStats.median.toExponential(6)}`,
    `gap_min,${summary.gapStats.min.toExponential(6)}`,
    `gap_max,${summary.gapStats.max.toExponential(6)}`,
    `gap_std,${summary.gapStats.std.toExponential(6)}`,
    "",
    "karlin_statistics,",
    `karlin_mean,${summary.karlinStats.mean.toExponential(6)}`,
    `karlin_median,${summary.karlinStats.median.toExponential(6)}`,
    `karlin_min,${summary.karlinStats.min.toExponential(6)}`,
    `karlin_max,${summary.karlinStats.max.toExponential(6)}`,
    `karlin_std,${summary.karlinStats.std.toExponential(6)}`,
    `theoretical_bound,${summary.karlinStats.theoreticalBound.toExponential(6)}`,
    `ratio_to_theory,${summary.karlinStats.ratioToTheory.toFixed(4)}`,
  ];
  
  return lines.join("\n");
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(
  summary: SimulationSummary,
  matrices?: Matrix[]
): string {
  const lines = [
    "# Fictitious Play Simulation Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- **Total Iterations:** ${summary.totalIterations.toLocaleString()}`,
    `- **Games Count:** ${summary.gamesCount}`,
    `- **Execution Time:** ${(summary.executionTimeMs / 1000).toFixed(2)}s`,
    "",
    "## Gap Statistics",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Mean | ${summary.gapStats.mean.toExponential(4)} |`,
    `| Median | ${summary.gapStats.median.toExponential(4)} |`,
    `| Min | ${summary.gapStats.min.toExponential(4)} |`,
    `| Max | ${summary.gapStats.max.toExponential(4)} |`,
    `| Std Dev | ${summary.gapStats.std.toExponential(4)} |`,
    "",
    "## Karlin's Ratio Statistics",
    "",
    "According to Robinson (1951), fictitious play converges at rate O(T^{-1/2}) for zero-sum games.",
    "Karlin's ratio (gap × √T) should converge to a constant.",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Mean | ${summary.karlinStats.mean.toExponential(4)} |`,
    `| Median | ${summary.karlinStats.median.toExponential(4)} |`,
    `| Min | ${summary.karlinStats.min.toExponential(4)} |`,
    `| Max | ${summary.karlinStats.max.toExponential(4)} |`,
    `| Std Dev | ${summary.karlinStats.std.toExponential(4)} |`,
    `| Theoretical Bound | ${summary.karlinStats.theoreticalBound.toExponential(4)} |`,
    `| Ratio to Theory | ${summary.karlinStats.ratioToTheory.toFixed(4)} |`,
  ];
  
  if (matrices && matrices.length > 0) {
    lines.push("");
    lines.push("## Game Matrices");
    lines.push("");
    
    for (let i = 0; i < matrices.length; i++) {
      lines.push(`### Game ${i + 1} (${matrices[i].length}×${matrices[i][0].length})`);
      lines.push("");
      lines.push("```");
      for (const row of matrices[i]) {
        lines.push(row.map(v => v.toFixed(4).padStart(8)).join(" "));
      }
      lines.push("```");
      lines.push("");
    }
  }
  
  return lines.join("\n");
}

/**
 * Trigger file download in browser
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export results to CSV file
 */
export function exportToCSV(
  iterations: number[],
  allGaps: number[][],
  avgGaps: number[],
  filename: string = "fp_results.csv"
): void {
  const content = generateCSV(iterations, allGaps, avgGaps);
  downloadFile(content, filename, "text/csv");
}

/**
 * Export summary to CSV file
 */
export function exportSummaryToCSV(
  summary: SimulationSummary,
  filename: string = "fp_summary.csv"
): void {
  const content = generateSummaryCSV(summary);
  downloadFile(content, filename, "text/csv");
}

/**
 * Export markdown report
 */
export function exportToMarkdown(
  summary: SimulationSummary,
  matrices?: Matrix[],
  filename: string = "fp_report.md"
): void {
  const content = generateMarkdownReport(summary, matrices);
  downloadFile(content, filename, "text/markdown");
}
