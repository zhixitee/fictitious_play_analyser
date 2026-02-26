import type { Matrix } from "./games";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";
import type { RNG } from "./rng";
import { randInt } from "./rng";

export interface SolverConfig {
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
  rng: RNG;
}

export interface SolverState {
  matrix: Matrix;
  n: number;
  m: number;
  countRow: Float64Array;
  countCol: Float64Array;
  t: number;
  config: SolverConfig;
}

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

  const t = cfg.initialization === "random"
    ? countRow.reduce((a, b) => a + b, 0)
    : 1;

  return { matrix, n, m, countRow, countCol, t, config: cfg };
}

function dotRow(A: Matrix, row: number, v: Float64Array): number {
  let s = 0;
  const r = A[row];
  for (let j = 0; j < v.length; j++) {
    s += r[j] * v[j];
  }
  return s;
}

function dotCol(u: Float64Array, A: Matrix, col: number): number {
  let s = 0;
  for (let i = 0; i < u.length; i++) {
    s += u[i] * A[i][col];
  }
  return s;
}

// Argmax/argmin with tie-breaking: lexicographic, anti-lexicographic, or random.
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

    for (let i = 0; i < n; i++) {
      rowStrategy[i] = countRow[i] / t;
    }
    for (let j = 0; j < m; j++) {
      colStrategy[j] = countCol[j] / t;
    }

    for (let i = 0; i < n; i++) {
      rowPayoffs[i] = dotRow(matrix, i, colStrategy);
    }

    for (let j = 0; j < m; j++) {
      colPayoffs[j] = dotCol(rowStrategy, matrix, j);
    }

    const bestRow = selectBestResponse(rowPayoffs, n, "max", cfg.tieBreaking, cfg.rng, tiedBuffer);
    const bestCol = selectBestResponse(colPayoffs, m, "min", cfg.tieBreaking, cfg.rng, tiedBuffer);

    bestRowHistory[k] = bestRow;
    bestColHistory[k] = bestCol;

    // duality gap = max row payoff - min col payoff
    gaps[k] = rowPayoffs[bestRow] - colPayoffs[bestCol];

    countRow[bestRow] += 1;
    countCol[bestCol] += 1;
  }

  state.t += steps;

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

export function getCurrentStrategies(state: SolverState): {
  rowStrategy: number[];
  colStrategy: number[];
} {
  const rowStrategy = Array.from(state.countRow).map(c => c / state.t);
  const colStrategy = Array.from(state.countCol).map(c => c / state.t);
  return { rowStrategy, colStrategy };
}

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
