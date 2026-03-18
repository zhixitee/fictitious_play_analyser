import { RNG, randUniform } from "./rng";

export type Matrix = number[][];

export function zeros(n: number, m: number): Matrix {
  return Array.from({ length: n }, () => Array.from({ length: m }, () => 0));
}

export function transpose(A: Matrix): Matrix {
  const n = A.length;
  const m = A[0].length;
  const T = zeros(m, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

// (M - M^T) / 2 ensures the game is zero-sum.
export function skewSymmetrize(M: Matrix): Matrix {
  const n = M.length;
  const out = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out[i][j] = (M[i][j] - M[j][i]) / 2;
    }
  }
  return out;
}

export function getRandomZeroSumGame(n: number, rng: RNG): Matrix {
  const M = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = randUniform(rng, -1, 1);
    }
  }
  return skewSymmetrize(M);
}

export function getRPSGame(): Matrix {
  return [
    [0, -1, 1],
    [1, 0, -1],
    [-1, 1, 0],
  ];
}

export function getDiagonalGame(n: number): Matrix {
  const M = zeros(n, n);
  for (let i = 0; i < n; i++) {
    M[i][i] = 0;
    for (let j = i + 1; j < n; j++) {
      M[i][j] = 1;
      M[j][i] = -1;
    }
  }
  return M;
}

// ── Wang (2025) construction helpers ──────────────────────────────────────────

function buildWang9x9(): Matrix {
  // Base RPS matrix (A_rps)
  const A_rps: Matrix = [
    [0, -1, 1],
    [1, 0, -1],
    [-1, 1, 0],
  ];

  const B: Matrix = [
    [71, 54, 75],
    [54, 21, 25],
    [75, 25, 50],
  ].map(row => row.map(x => (-1 / 900) * x));

  const M9 = zeros(9, 9);

  const put3 = (bi: number, bj: number, X: Matrix) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        M9[bi * 3 + i][bj * 3 + j] = X[i][j];
      }
    }
  };

  const neg = (X: Matrix) => X.map(r => r.map(v => -v));

  put3(0, 0, A_rps);
  put3(0, 1, B);
  put3(0, 2, neg(B));
  put3(1, 0, neg(B));
  put3(1, 1, A_rps);
  put3(1, 2, B);
  put3(2, 0, B);
  put3(2, 1, neg(B));
  put3(2, 2, A_rps);

  return M9;
}

/**
 * Wang (2025) prescribed initial utility U₀ for the 9×9 game.
 *
 * U₀ = [V₁·1 ; V₂·1 ; V₃·1] where V₁, V₂, V₃ are the 3×3 admissible
 * matrices from Wang's Construction 1. This non-standard initialization
 * bootstraps the periodic phase structure that produces gap = Θ(t^{−1/3}).
 *
 * In the FP dynamics, utility evolves as: U_{t+1} = U_t + A·e_{i_{t+1}}
 * starting from this U₀ (not from the zero vector).
 */
export const WANG_INITIAL_UTILITY_C1: Float64Array = Float64Array.from([
  460 / 27,         //  V₁·1 [0]  ≈  17.037
  136 / 27,         //  V₁·1 [1]  ≈   5.037
  460 / 27,         //  V₁·1 [2]  ≈  17.037
  -169687 / 2700,   //  V₂·1 [0]  ≈ −62.847
  -67513 / 2700,    //  V₂·1 [1]  ≈ −25.005
  -1357 / 27,       //  V₂·1 [2]  ≈ −50.259
  -5,               //  V₃·1 [0]  = −5
  17,               //  V₃·1 [1]  =  17
  -12,              //  V₃·1 [2]  = −12
]);

// Comparison variant for U₀[8] sign-sensitivity experiments.
export const WANG_INITIAL_UTILITY_C2: Float64Array = Float64Array.from([
  460 / 27,         //  V₁·1 [0]  ≈  17.037
  136 / 27,         //  V₁·1 [1]  ≈   5.037
  460 / 27,         //  V₁·1 [2]  ≈  17.037
  -169687 / 2700,   //  V₂·1 [0]  ≈ −62.847
  -67513 / 2700,    //  V₂·1 [1]  ≈ −25.005
  -1357 / 27,       //  V₂·1 [2]  ≈ −50.259
  -5,               //  V₃·1 [0]  = −5
  17,               //  V₃·1 [1]  =  17
  12,               //  V₃·1 [2]  = +12
]);

/**
 * Wang (2025) 9×9 game — Construction 1.
 *
 * Skew-symmetric block matrix: M = [A_rps, B, -B; -B, A_rps, B; B, -B, A_rps]
 * where A_rps is 3×3 RPS and B is a symmetric perturbation.
 *
 * Requires non-standard initialization (WANG_INITIAL_UTILITY) and
 * lexicographic tie-breaking to reproduce the Θ(t^{−1/3}) lower bound.
 * The game is skew-symmetric (M = −Mᵀ), so FP is symmetric: x_t = y_t.
 */
export function getWang2025(): Matrix {
  return buildWang9x9();
}

/**
 * Wang (2025) 10×10 augmented game — Construction 2.
 *
 * Adds a dummy anchor action (row/col 0) to the 9×9 game so that
 * tie-breaking-agnostic dynamics reproduce the same Θ(t^{−1/3}) trajectory
 * without needing a prescribed U₀.
 *
 * Parameterization matches Appendix A (M_aug) with:
 *  - delta = 1/2700
 *  - base shift = 169687/2700
 *  - blockwise offsets [2δ, δ, 0] repeated across the 3 blocks
 *
 * Dynamics are intended to run from x0 = y0 = 0, where the only expected tie
 * is the first step (as stated in the paper's tie-agnostic construction).
 */
export function getWang2025Augmented(): Matrix {
  const M9 = buildWang9x9();

  const U0 = [
    460 / 27, 136 / 27, 460 / 27,
    -169687 / 2700, -67513 / 2700, -1357 / 27,
    -5, 17, -12,
  ];

  const delta = 1 / 2700;
  const base = 169687 / 2700;
  const add = [2 * delta, delta, 0, 2 * delta, delta, 0, 2 * delta, delta, 0];
  const U0_hat = U0.map((v, i) => v + base + add[i]);

  const M10 = zeros(10, 10);

  for (let j = 1; j < 10; j++) {
    M10[0][j] = -U0_hat[j - 1];
  }
  for (let i = 1; i < 10; i++) {
    M10[i][0] = U0_hat[i - 1];
  }
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      M10[i + 1][j + 1] = M9[i][j];
    }
  }

  return M10;
}

export function validateMatrix(M: Matrix): { valid: boolean; error?: string } {
  if (!M || M.length < 2) {
    return { valid: false, error: "Matrix must be at least 2x2" };
  }
  
  const n = M.length;
  for (let i = 0; i < n; i++) {
    if (!M[i] || M[i].length !== n) {
      return { valid: false, error: "Matrix must be square" };
    }
    for (let j = 0; j < n; j++) {
      if (typeof M[i][j] !== "number" || isNaN(M[i][j])) {
        return { valid: false, error: `Invalid value at position (${i}, ${j})` };
      }
    }
  }
  
  return { valid: true };
}
