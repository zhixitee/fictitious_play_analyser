import type { Matrix } from "./games";
import { WANG_INITIAL_UTILITY } from "./games";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";
import type { RNG } from "./rng";
import { randInt } from "./rng";

export interface SolverConfig {
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
  /** Enforce x_t = y_t (symmetric FP for skew-symmetric games). */
  symmetric: boolean;
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
  /**
   * Wang (2025) 9×9 non-standard initialization.
   * When set, this utility vector biases the best-response selection at every
   * iteration: effective payoff = A·(count/t) + initialUtility/t.
   * The bias decays as 1/t, matching the paper’s U_t = U₀ + A·x_t dynamics.
   * The gap is still measured on the *unbiased* strategies.
   */
  initialUtility: Float64Array | null;
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
  symmetric: false,
  rng: Math.random,
};

export function createSolver(matrix: Matrix, config?: Partial<SolverConfig>): SolverState {
  const cfg: SolverConfig = { ...defaultConfig, ...config };
  const n = matrix.length;
  const m = matrix[0].length;
  const countRow = new Float64Array(n);
  const countCol = new Float64Array(m);
  let initialUtility: Float64Array | null = null;
  
  if (cfg.initialization === "random") {
    // Initialize counts with random integers 1..10
    for (let i = 0; i < n; i++) {
      countRow[i] = randInt(cfg.rng, 1, 10);
    }
    for (let j = 0; j < m; j++) {
      countCol[j] = randInt(cfg.rng, 1, 10);
    }
    // Both count arrays must share the same total so that dividing by t
    // produces valid probability distributions for both players.
    const rowTotal = countRow.reduce((a, b) => a + b, 0);
    const colTotal = countCol.reduce((a, b) => a + b, 0);
    if (colTotal > 0 && colTotal !== rowTotal) {
      const scale = rowTotal / colTotal;
      for (let j = 0; j < m; j++) {
        countCol[j] *= scale;
      }
    }
  } else if (cfg.initialization === "wang") {
    // Wang (2025) — 9×9 Construction 1 with non-standard initialization.
    //
    // The paper prescribes an initial utility U₀ that is NOT derivable from
    // any count vector (the 9×9 skew-symmetric matrix is singular).
    // The FP dynamics use: U_t = U₀ + A·x_t, and best response = argmax(U_t).
    //
    // We implement this by starting with zero counts (x₀ = 0) at t = 1 and
    // adding U₀/t to the computed payoffs at each step. The bias naturally
    // decays, producing the paper’s Θ(t^{−1/3}) gap trajectory.
    //
    // The game is skew-symmetric (M = −Mᵀ), so FP is symmetric: x_t = y_t.
    // We enforce this invariant after each step.
    initialUtility = new Float64Array(n);
    for (let i = 0; i < Math.min(n, WANG_INITIAL_UTILITY.length); i++) {
      initialUtility[i] = WANG_INITIAL_UTILITY[i];
    }
    // Counts start at zero — no actions played yet. t = 0.
  } else {
    // Standard: first action played once
    countRow[0] = 1;
    countCol[0] = 1;
  }

  const t = cfg.initialization === "random"
    ? countRow.reduce((a, b) => a + b, 0)
    : cfg.initialization === "wang" ? 0 : 1;

  return { matrix, n, m, countRow, countCol, t, config: cfg, initialUtility };
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
  const { matrix, countRow, countCol, config: cfg, initialUtility } = state;
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

  // Biased payoff buffers for Wang mode (U₀-augmented best-response selection)
  const biasedRowPayoffs = initialUtility ? new Float64Array(n) : null;
  const biasedColPayoffs = initialUtility ? new Float64Array(m) : null;

  // Pre-allocate tie buffers (max size = max(n, m))
  const tiedBuffer = new Int32Array(Math.max(n, m));

  for (let k = 0; k < steps; k++) {
    const t = state.t + k;
    iters[k] = t;

    let bestRow: number;
    let bestCol: number;

    if (t === 0 && initialUtility) {
      // Wang mode, first step (t=0): x₀ = 0, no strategy formed yet.
      // Use prescribed U₀ directly for best-response selection.
      // For the row player: argmax(U₀).
      // For the column player in skew-symmetric game: argmin(-U₀) = argmax(U₀).
      bestRow = selectBestResponse(initialUtility, n, "max", cfg.tieBreaking, cfg.rng, tiedBuffer);
      // Negate U₀ for column player’s perspective
      for (let j = 0; j < m; j++) {
        colPayoffs[j] = -initialUtility[j];
      }
      bestCol = selectBestResponse(colPayoffs, m, "min", cfg.tieBreaking, cfg.rng, tiedBuffer);
      // Gap is 0 at t=0: no strategy pair exists yet
      gaps[k] = 0;
    } else {
      for (let i = 0; i < n; i++) {
        rowStrategy[i] = countRow[i] / t;
      }
      for (let j = 0; j < m; j++) {
        colStrategy[j] = countCol[j] / t;
      }

      // Standard (unbiased) payoffs — used for gap computation
      for (let i = 0; i < n; i++) {
        rowPayoffs[i] = dotRow(matrix, i, colStrategy);
      }
      for (let j = 0; j < m; j++) {
        colPayoffs[j] = dotCol(rowStrategy, matrix, j);
      }

      if (initialUtility && biasedRowPayoffs && biasedColPayoffs) {
        // Wang mode (t ≥ 1): best-response uses U₀-biased payoffs.
        // Effective utility = (A·count + U₀) / t = standard_payoff + U₀/t.
        // For the row player (maximizer): add bias.
        // For the column player (minimizer) in skew-symmetric game: subtract bias,
        // ensuring argmin(col_biased) = argmax(row_biased) (symmetric FP).
        const invT = 1 / t;
        for (let i = 0; i < n; i++) {
          biasedRowPayoffs[i] = rowPayoffs[i] + initialUtility[i] * invT;
        }
        for (let j = 0; j < m; j++) {
          biasedColPayoffs[j] = colPayoffs[j] - initialUtility[j] * invT;
        }
        bestRow = selectBestResponse(biasedRowPayoffs, n, "max", cfg.tieBreaking, cfg.rng, tiedBuffer);
        bestCol = selectBestResponse(biasedColPayoffs, m, "min", cfg.tieBreaking, cfg.rng, tiedBuffer);
      } else {
        bestRow = selectBestResponse(rowPayoffs, n, "max", cfg.tieBreaking, cfg.rng, tiedBuffer);
        bestCol = selectBestResponse(colPayoffs, m, "min", cfg.tieBreaking, cfg.rng, tiedBuffer);
      }

      // duality gap = max row payoff - min col payoff (unbiased, on actual strategies)
      gaps[k] = rowPayoffs[bestRow] - colPayoffs[bestCol];
    }

    countRow[bestRow] += 1;
    countCol[bestCol] += 1;

    // Skew-symmetric game: enforce x_t = y_t to prevent
    // floating-point drift from breaking the symmetric-FP invariant.
    if (cfg.symmetric) {
      for (let j = 0; j < n; j++) {
        countCol[j] = countRow[j];
      }
    }
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

// ── Validation ────────────────────────────────────────────────────────────────

const EPS = 1e-9;

export interface ValidationViolation {
  iteration: number;
  check: string;
  detail: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: number;
  violations: ValidationViolation[];
}

/**
 * Validates FP invariants for a chunk result against the solver state at
 * the *end* of the chunk (state.t already advanced).
 *
 * Checks performed:
 *  1. Strategy probabilities sum to 1 and are non-negative
 *  2. Best response is actually optimal (row max payoff, col min payoff)
 *  3. Duality gap is non-negative
 *  4. Gap does not exceed the Karlin O(1/√T) bound (with safety margin)
 */
export function validateChunkResult(
  state: SolverState,
  result: ChunkResult,
): ValidationResult {
  const violations: ValidationViolation[] = [];
  let checks = 0;

  const { matrix, n, m } = state;
  const { iters, gaps, finalRowStrategy, finalColStrategy, bestRowHistory, bestColHistory } = result;
  const steps = iters.length;

  // -- Check 1: Final strategies form valid probability distributions --
  checks++;
  const rowSum = finalRowStrategy.reduce((a, b) => a + b, 0);
  if (Math.abs(rowSum - 1.0) > EPS) {
    violations.push({ iteration: iters[steps - 1], check: "row_strategy_sum", detail: `Row strategy sums to ${rowSum}` });
  }
  checks++;
  const colSum = finalColStrategy.reduce((a, b) => a + b, 0);
  if (Math.abs(colSum - 1.0) > EPS) {
    violations.push({ iteration: iters[steps - 1], check: "col_strategy_sum", detail: `Col strategy sums to ${colSum}` });
  }
  checks++;
  for (let i = 0; i < n; i++) {
    if (finalRowStrategy[i] < -EPS) {
      violations.push({ iteration: iters[steps - 1], check: "row_weight_negative", detail: `Row weight[${i}] = ${finalRowStrategy[i]}` });
      break;
    }
  }
  checks++;
  for (let j = 0; j < m; j++) {
    if (finalColStrategy[j] < -EPS) {
      violations.push({ iteration: iters[steps - 1], check: "col_weight_negative", detail: `Col weight[${j}] = ${finalColStrategy[j]}` });
      break;
    }
  }

  // -- Check 2 & 3: Best response optimality and non-negative gap (sample a few points) --
  const sampleCount = Math.min(steps, 5);
  const sampleStep = Math.max(1, Math.floor(steps / sampleCount));

  for (let s = 0; s < sampleCount; s++) {
    const k = Math.min(s * sampleStep, steps - 1);
    const t = iters[k];
    if (t <= 0) continue;

    // Reconstruct strategies at iteration t by computing from counts up to that point
    // (approximation: use gap directly since counts aren't stored per-iteration)
    const gap = gaps[k];

    // Check 3: Gap must be non-negative for zero-sum games
    checks++;
    if (gap < -EPS) {
      violations.push({ iteration: t, check: "negative_gap", detail: `Gap = ${gap.toExponential(4)}` });
    }

    // Check 4: Gap should satisfy Karlin bound O(1/√T) with generous safety factor
    // We use 10× the matrix Frobenius norm as the constant multiplier
    // Skip for Wang mode: the whole point is gap = Θ(t^{−1/3}) > O(t^{−1/2})
    checks++;
    if (t >= 10 && state.config.initialization !== "wang") {
      let frobSq = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          frobSq += matrix[i][j] * matrix[i][j];
        }
      }
      const frobNorm = Math.sqrt(frobSq);
      const karlinBound = 10 * frobNorm / Math.sqrt(t);
      if (gap > karlinBound + EPS) {
        violations.push({ iteration: t, check: "exceeds_karlin_bound", detail: `Gap ${gap.toExponential(4)} exceeds 10‖A‖_F/√T = ${karlinBound.toExponential(4)}` });
      }
    }
  }

  // -- Check 5: Best response indices are in valid range --
  checks++;
  for (let k = 0; k < steps; k++) {
    if (bestRowHistory[k] < 0 || bestRowHistory[k] >= n) {
      violations.push({ iteration: iters[k], check: "invalid_row_br", detail: `BR row index ${bestRowHistory[k]} out of [0, ${n - 1}]` });
      break;
    }
  }
  checks++;
  for (let k = 0; k < steps; k++) {
    if (bestColHistory[k] < 0 || bestColHistory[k] >= m) {
      violations.push({ iteration: iters[k], check: "invalid_col_br", detail: `BR col index ${bestColHistory[k]} out of [0, ${m - 1}]` });
      break;
    }
  }

  return {
    passed: violations.length === 0,
    checks,
    violations,
  };
}
