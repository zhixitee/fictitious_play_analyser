/**
 * Fictitious Play Solver
 * 
 * Implements the fictitious play algorithm for zero-sum games.
 * Designed for chunked execution to enable real-time progress updates.
 * 
 * Supports configurable tie-breaking rules and initialization modes
 * to investigate Karlin's Conjectures (Strong vs. Weak) regarding
 * the O(t^{-1/2}) convergence rate.
 */

import type { Matrix } from "./games";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";
import type { RNG } from "./rng";
import { randInt } from "./rng";

/**
 * Configuration for solver behavior
 */
export interface SolverConfig {
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
  rng: RNG;
}

/**
 * Solver state containing current counts and iteration
 */
export interface SolverState {
  matrix: Matrix;
  n: number;
  m: number;
  countRow: Float64Array;
  countCol: Float64Array;
  t: number;
  config: SolverConfig;
}

/**
 * Result from a chunk of iterations
 */
export interface ChunkResult {
  iters: Int32Array;
  gaps: Float64Array;
  finalRowStrategy: Float64Array;
  finalColStrategy: Float64Array;
  bestRowHistory: Int32Array;
  bestColHistory: Int32Array;
}

const defaultConfig: SolverConfig = {
  tieBreaking: "lexicographic",
  initialization: "standard",
  rng: Math.random,
};

/**
 * Create a new solver for a game matrix
 */
export function createSolver(matrix: Matrix, config?: Partial<SolverConfig>): SolverState {
  const cfg: SolverConfig = { ...defaultConfig, ...config };
  const n = matrix.length;
  const m = matrix[0].length;
  const countRow = new Float64Array(n);
  const countCol = new Float64Array(m);
  
  if (cfg.initialization === "random") {
    // Initialize counts with random integers 1..10
    for (let i = 0; i < n; i++) {
      countRow[i] = randInt(cfg.rng, 1, 10);
    }
    for (let j = 0; j < m; j++) {
      countCol[j] = randInt(cfg.rng, 1, 10);
    }
  } else {
    // Standard: first action played once
    countRow[0] = 1;
    countCol[0] = 1;
  }

  // Initial t = sum of counts for the row player (they should be equal)
  const t = cfg.initialization === "random"
    ? countRow.reduce((a, b) => a + b, 0)
    : 1;

  return { matrix, n, m, countRow, countCol, t, config: cfg };
}

/**
 * Compute dot product: A[row] . v
 */
function dotRow(A: Matrix, row: number, v: Float64Array): number {
  let s = 0;
  const r = A[row];
  for (let j = 0; j < v.length; j++) {
    s += r[j] * v[j];
  }
  return s;
}

/**
 * Compute dot product: u^T . A[:, col]
 */
function dotCol(u: Float64Array, A: Matrix, col: number): number {
  let s = 0;
  for (let i = 0; i < u.length; i++) {
    s += u[i] * A[i][col];
  }
  return s;
}

/**
 * Select best response index from payoffs using the configured tie-breaking rule.
 * 
 * For "maximize" direction: finds argmax of payoffs.
 * For "minimize" direction: finds argmin of payoffs.
 * 
 * Tie-breaking:
 * - lexicographic: lowest index among tied optima
 * - anti-lexicographic: highest index among tied optima
 * - random: uniform random among tied optima (using seeded RNG)
 * 
 * Uses a pre-allocated buffer to avoid per-iteration allocations for random mode.
 */
function selectBestResponse(
  payoffs: Float64Array,
  count: number,
  direction: "max" | "min",
  rule: TieBreakingRule,
  rng: RNG,
  tiedBuffer: Int32Array,
): number {
  let bestVal = direction === "max" ? -Infinity : Infinity;
  let bestIdx = 0;
  let tiedCount = 0;

  const isBetter = direction === "max"
    ? (a: number, b: number) => a > b
    : (a: number, b: number) => a < b;

  for (let i = 0; i < count; i++) {
    const p = payoffs[i];
    if (isBetter(p, bestVal)) {
      bestVal = p;
      bestIdx = i;
      tiedCount = 1;
      tiedBuffer[0] = i;
    } else if (p === bestVal) {
      tiedBuffer[tiedCount] = i;
      tiedCount++;
    }
  }

  if (tiedCount <= 1) return bestIdx;

  switch (rule) {
    case "lexicographic":
      return tiedBuffer[0];
    case "anti-lexicographic":
      return tiedBuffer[tiedCount - 1];
    case "random":
      return tiedBuffer[Math.floor(rng() * tiedCount)];
    default:
      return bestIdx;
  }
}

/**
 * Run a chunk of fictitious play iterations
 * 
 * @param state - Current solver state (modified in place)
 * @param steps - Number of iterations to run
 * @returns Chunk result with iterations, gaps, final strategies, and best response history
 */
export function stepChunk(state: SolverState, steps: number): ChunkResult {
  const { matrix, countRow, countCol, config: cfg } = state;
  const n = countRow.length;
  const m = countCol.length;

  const gaps = new Float64Array(steps);
  const iters = new Int32Array(steps);
  const bestRowHistory = new Int32Array(steps);
  const bestColHistory = new Int32Array(steps);

  const rowStrategy = new Float64Array(n);
  const colStrategy = new Float64Array(m);
  const rowPayoffs = new Float64Array(n);
  const colPayoffs = new Float64Array(m);

  // Pre-allocate tie buffers (max size = max(n, m))
  const tiedBuffer = new Int32Array(Math.max(n, m));

  for (let k = 0; k < steps; k++) {
    const t = state.t + k;
    iters[k] = t;

    // Compute current mixed strategies
    for (let i = 0; i < n; i++) {
      rowStrategy[i] = countRow[i] / t;
    }
    for (let j = 0; j < m; j++) {
      colStrategy[j] = countCol[j] / t;
    }

    // Compute payoffs for all row actions: A * colStrategy
    for (let i = 0; i < n; i++) {
      rowPayoffs[i] = dotRow(matrix, i, colStrategy);
    }

    // Compute payoffs for all col actions: rowStrategy^T * A
    for (let j = 0; j < m; j++) {
      colPayoffs[j] = dotCol(rowStrategy, matrix, j);
    }

    // Select best responses using tie-breaking rule
    const bestRow = selectBestResponse(rowPayoffs, n, "max", cfg.tieBreaking, cfg.rng, tiedBuffer);
    const bestCol = selectBestResponse(colPayoffs, m, "min", cfg.tieBreaking, cfg.rng, tiedBuffer);

    bestRowHistory[k] = bestRow;
    bestColHistory[k] = bestCol;

    // Duality gap = max row payoff - min col payoff
    gaps[k] = rowPayoffs[bestRow] - colPayoffs[bestCol];

    // Update action counts
    countRow[bestRow] += 1;
    countCol[bestCol] += 1;
  }

  // Update total iteration count
  state.t += steps;

  // Compute final strategies for this chunk
  const finalRowStrategy = new Float64Array(n);
  const finalColStrategy = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    finalRowStrategy[i] = countRow[i] / state.t;
  }
  for (let j = 0; j < m; j++) {
    finalColStrategy[j] = countCol[j] / state.t;
  }

  return { iters, gaps, finalRowStrategy, finalColStrategy, bestRowHistory, bestColHistory };
}

/**
 * Get current strategies from solver state
 */
export function getCurrentStrategies(state: SolverState): {
  rowStrategy: number[];
  colStrategy: number[];
} {
  const rowStrategy = Array.from(state.countRow).map(c => c / state.t);
  const colStrategy = Array.from(state.countCol).map(c => c / state.t);
  return { rowStrategy, colStrategy };
}

/**
 * Compute current gap without advancing the state
 */
export function getCurrentGap(state: SolverState): number {
  const { matrix, countRow, countCol, t, n, m } = state;
  
  const rowStrategy = new Float64Array(n);
  const colStrategy = new Float64Array(m);
  
  for (let i = 0; i < n; i++) {
    rowStrategy[i] = countRow[i] / t;
  }
  for (let j = 0; j < m; j++) {
    colStrategy[j] = countCol[j] / t;
  }

  let maxRowPayoff = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = dotRow(matrix, i, colStrategy);
    if (p > maxRowPayoff) maxRowPayoff = p;
  }

  let minColPayoff = Infinity;
  for (let j = 0; j < m; j++) {
    const p = dotCol(rowStrategy, matrix, j);
    if (p < minColPayoff) minColPayoff = p;
  }

  return maxRowPayoff - minColPayoff;
}
