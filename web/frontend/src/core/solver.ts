/**
 * Fictitious Play Solver
 * 
 * Implements the fictitious play algorithm for zero-sum games.
 * Designed for chunked execution to enable real-time progress updates.
 */

import type { Matrix } from "./games";

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
}

/**
 * Result from a chunk of iterations
 */
export interface ChunkResult {
  iters: Int32Array;
  gaps: Float64Array;
  finalRowStrategy: Float64Array;
  finalColStrategy: Float64Array;
}

/**
 * Create a new solver for a game matrix
 */
export function createSolver(matrix: Matrix): SolverState {
  const n = matrix.length;
  const m = matrix[0].length;
  const countRow = new Float64Array(n);
  const countCol = new Float64Array(m);
  
  // Initialize with first action played once
  countRow[0] = 1;
  countCol[0] = 1;

  return { matrix, n, m, countRow, countCol, t: 1 };
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
 * Run a chunk of fictitious play iterations
 * 
 * @param state - Current solver state (modified in place)
 * @param steps - Number of iterations to run
 * @returns Chunk result with iterations, gaps, and final strategies
 */
export function stepChunk(state: SolverState, steps: number): ChunkResult {
  const { matrix, countRow, countCol } = state;
  const n = countRow.length;
  const m = countCol.length;

  const gaps = new Float64Array(steps);
  const iters = new Int32Array(steps);

  const rowStrategy = new Float64Array(n);
  const colStrategy = new Float64Array(m);

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

    // Find row player's best response: argmax_i (A * colStrategy)_i
    let maxRowPayoff = -Infinity;
    let bestRow = 0;
    for (let i = 0; i < n; i++) {
      const p = dotRow(matrix, i, colStrategy);
      if (p > maxRowPayoff) {
        maxRowPayoff = p;
        bestRow = i;
      }
    }

    // Find column player's best response: argmin_j (rowStrategy^T * A)_j
    let minColPayoff = Infinity;
    let bestCol = 0;
    for (let j = 0; j < m; j++) {
      const p = dotCol(rowStrategy, matrix, j);
      if (p < minColPayoff) {
        minColPayoff = p;
        bestCol = j;
      }
    }

    // Duality gap = max row payoff - min col payoff
    gaps[k] = maxRowPayoff - minColPayoff;

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

  return { iters, gaps, finalRowStrategy, finalColStrategy };
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
