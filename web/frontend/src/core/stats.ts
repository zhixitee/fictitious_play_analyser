/**
 * Statistical Functions
 * 
 * Utility functions for computing summary statistics
 * on simulation results.
 */

/**
 * Compute mean of an array
 */
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute median of an array
 */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute minimum of an array
 */
export function min(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.min(...arr);
}

/**
 * Compute maximum of an array
 */
export function max(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.max(...arr);
}

/**
 * Compute standard deviation of an array
 */
export function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const squaredDiffs = arr.map(x => (x - m) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Compute Karlin's ratio: gap * sqrt(iteration)
 * According to Robinson (1951), this should converge to a constant
 */
export function karlinRatio(gap: number, iteration: number): number {
  return gap * Math.sqrt(iteration);
}

/**
 * Compute theoretical bound: 1/sqrt(T)
 */
export function theoreticalBound(iteration: number): number {
  return 1 / Math.sqrt(iteration);
}

/**
 * Summary statistics for final gaps
 */
export interface GapSummary {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
}

/**
 * Karlin ratio summary statistics
 */
export interface KarlinSummary {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  theoreticalBound: number;
  ratioToTheory: number;
}

/**
 * Compute summary statistics for final gaps across all games
 */
export function computeGapSummary(finalGaps: number[]): GapSummary {
  return {
    mean: mean(finalGaps),
    median: median(finalGaps),
    min: min(finalGaps),
    max: max(finalGaps),
    std: std(finalGaps),
  };
}

/**
 * Compute Karlin ratio summary statistics
 */
export function computeKarlinSummary(
  finalGaps: number[],
  finalIteration: number
): KarlinSummary {
  const ratios = finalGaps.map(g => karlinRatio(g, finalIteration));
  const theoryBound = theoreticalBound(finalIteration);
  const meanRatio = mean(ratios);

  return {
    mean: meanRatio,
    median: median(ratios),
    min: min(ratios),
    max: max(ratios),
    std: std(ratios),
    theoreticalBound: theoryBound,
    ratioToTheory: meanRatio / (theoryBound * Math.sqrt(finalIteration)),
  };
}

/**
 * Full simulation summary
 */
export interface SimulationSummary {
  totalIterations: number;
  gamesCount: number;
  executionTimeMs: number;
  gapStats: GapSummary;
  karlinStats: KarlinSummary;
}

/**
 * Compute full simulation summary
 */
export function computeSimulationSummary(
  allGaps: number[][],
  totalIterations: number,
  executionTimeMs: number
): SimulationSummary {
  const finalGaps = allGaps.map(gaps => gaps[gaps.length - 1] ?? 0);

  return {
    totalIterations,
    gamesCount: allGaps.length,
    executionTimeMs,
    gapStats: computeGapSummary(finalGaps),
    karlinStats: computeKarlinSummary(finalGaps, totalIterations),
  };
}
