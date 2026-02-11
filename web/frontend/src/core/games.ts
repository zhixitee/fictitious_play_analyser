/**
 * Game Matrix Generation
 * 
 * Functions for generating zero-sum game matrices:
 * - Random skew-symmetric matrices
 * - Wang (2025) construction
 * - Custom templates
 */

import { RNG, randUniform } from "./rng";

export type Matrix = number[][];

/**
 * Create a zero-filled matrix
 */
export function zeros(n: number, m: number): Matrix {
  return Array.from({ length: n }, () => Array.from({ length: m }, () => 0));
}

/**
 * Transpose a matrix
 */
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

/**
 * Convert matrix to skew-symmetric form: (M - M^T) / 2
 * This ensures the game is zero-sum
 */
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

/**
 * Generate a random zero-sum (skew-symmetric) game matrix
 * @param n - Size of the square matrix (2..10)
 * @param rng - Random number generator
 */
export function getRandomZeroSumGame(n: number, rng: RNG): Matrix {
  const M = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = randUniform(rng, -1, 1);
    }
  }
  return skewSymmetrize(M);
}

/**
 * Rock-Paper-Scissors template (3x3)
 */
export function getRPSGame(): Matrix {
  return [
    [0, -1, 1],
    [1, 0, -1],
    [-1, 1, 0],
  ];
}

/**
 * Zero-sum diagonal game template
 */
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

/**
 * Wang (2025) construction matrix (10x10)
 * 
 * This is a carefully constructed game that exhibits interesting
 * convergence properties for fictitious play analysis.
 */
export function getWang2025(): Matrix {
  // Base RPS matrix (A_rps)
  const A_rps: Matrix = [
    [0, -1, 1],
    [1, 0, -1],
    [-1, 1, 0],
  ];

  // B matrix (scaled)
  const B: Matrix = [
    [71, 54, 75],
    [54, 21, 25],
    [75, 25, 50],
  ].map(row => row.map(x => (-1 / 900) * x));

  // Build 9x9 block matrix M9
  const M9 = zeros(9, 9);

  // Helper to write 3x3 block at (bi, bj)
  const put3 = (bi: number, bj: number, X: Matrix) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        M9[bi * 3 + i][bj * 3 + j] = X[i][j];
      }
    }
  };

  // Negate matrix helper
  const neg = (X: Matrix) => X.map(r => r.map(v => -v));

  // Fill the 3x3 block structure
  put3(0, 0, A_rps);
  put3(0, 1, B);
  put3(0, 2, neg(B));
  put3(1, 0, neg(B));
  put3(1, 1, A_rps);
  put3(1, 2, B);
  put3(2, 0, B);
  put3(2, 1, neg(B));
  put3(2, 2, A_rps);

  // U0 vector (from Wang's construction)
  const U0 = [
    460 / 27, 136 / 27, 460 / 27,
    -169687 / 2700, -67513 / 2700, -1357 / 27,
    -5, 17, 12,
  ];

  // Adjustment terms
  const delta = 1 / 2700;
  const base = 169687 / 2700;
  const add = [2 * delta, delta, 0, 2 * delta, delta, 0, 2 * delta, delta, 0];
  const U0_hat = U0.map((v, i) => v + base + add[i]);

  // Build final 10x10 matrix
  const M10 = zeros(10, 10);

  // Top row (0, 1:) = -U0_hat
  for (let j = 1; j < 10; j++) {
    M10[0][j] = -U0_hat[j - 1];
  }

  // Left column (1:, 0) = +U0_hat
  for (let i = 1; i < 10; i++) {
    M10[i][0] = U0_hat[i - 1];
  }

  // Bottom-right 9x9 is M9
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      M10[i + 1][j + 1] = M9[i][j];
    }
  }

  return M10;
}

/**
 * Validate that a matrix is properly formed
 */
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
