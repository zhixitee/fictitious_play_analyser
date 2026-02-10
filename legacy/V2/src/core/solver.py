"""
Fictitious Play solver implementing Brown-Robinson algorithm.

Theoretical foundations:
- Robinson (1951): Convergence proof for zero-sum games
- Karlin's conjecture: O(T^(-1/2)) convergence rate
- Wang (2025): Ω(T^(-1/3)) lower bound for specific games
"""
import numpy as np
from numba import njit


@njit(fastmath=True)
def fp_step_chunk(payoff_matrix, count_row, count_col, start_t, steps):
    """
    Execute Fictitious Play iterations with in-place count updates.
    
    Algorithm:
    1. Compute empirical strategies: σ(t) = count / t
    2. Calculate expected payoffs for each action
    3. Select best responses (argmax/argmin)
    4. Update counts and compute duality gap
    
    Args:
        payoff_matrix: n×m game matrix (row player payoffs)
        count_row: Action counts for row player (modified in-place)
        count_col: Action counts for column player (modified in-place)
        start_t: Current iteration number
        steps: Number of iterations to execute
    
    Returns:
        gaps: Array of duality gaps for each iteration
    """
    n, m = payoff_matrix.shape
    gaps = np.zeros(steps, dtype=np.float64)
    row_strategy = np.zeros(n, dtype=np.float64)
    col_strategy = np.zeros(m, dtype=np.float64)
    
    for i in range(steps):
        t = start_t + i
        
        # Compute empirical mixed strategies
        for r in range(n):
            row_strategy[r] = count_row[r] / t
        for c in range(m):
            col_strategy[c] = count_col[c] / t
        
        # Calculate expected payoffs
        row_payoffs = np.dot(payoff_matrix, col_strategy)
        col_payoffs = np.dot(row_strategy, payoff_matrix)
        
        # Duality gap: max_row(payoff) - min_col(payoff)
        gaps[i] = np.max(row_payoffs) - np.min(col_payoffs)
        
        # Best response updates
        count_row[np.argmax(row_payoffs)] += 1.0
        count_col[np.argmin(col_payoffs)] += 1.0
        
    return gaps


class FPSolver:
    """Fictitious Play solver for zero-sum games."""
    
    def __init__(self, matrix):
        self.matrix = matrix.astype(np.float64)
        self.n, self.m = self.matrix.shape
        
        # Initialize with uniform action selection
        self.count_row = np.zeros(self.n, dtype=np.float64)
        self.count_col = np.zeros(self.m, dtype=np.float64)
        self.count_row[0] = 1.0
        self.count_col[0] = 1.0
        
        self.current_t = 1

    def step(self, steps=100):
        """Execute iterations without history tracking (memory efficient)."""
        gaps = fp_step_chunk(
            self.matrix, 
            self.count_row, 
            self.count_col, 
            self.current_t, 
            steps
        )
        
        iterations = np.arange(self.current_t, self.current_t + steps)
        self.current_t += steps
        
        return iterations, gaps
    
    def step_with_history(self, steps=100):
        """Execute iterations with complete history for strategy reconstruction."""
        n, m = self.matrix.shape
        gaps = np.zeros(steps, dtype=np.float64)
        row_counts_history = []
        col_counts_history = []
        
        row_strategy = np.zeros(n, dtype=np.float64)
        col_strategy = np.zeros(m, dtype=np.float64)
        
        for i in range(steps):
            t = self.current_t + i
            
            for r in range(n):
                row_strategy[r] = self.count_row[r] / t
            for c in range(m):
                col_strategy[c] = self.count_col[c] / t
            
            row_payoffs = np.dot(self.matrix, col_strategy)
            col_payoffs = np.dot(row_strategy, self.matrix)
            
            gaps[i] = np.max(row_payoffs) - np.min(col_payoffs)
            
            self.count_row[np.argmax(row_payoffs)] += 1.0
            self.count_col[np.argmin(col_payoffs)] += 1.0
            
            row_counts_history.append(self.count_row.copy())
            col_counts_history.append(self.count_col.copy())
        
        iterations = np.arange(self.current_t, self.current_t + steps)
        self.current_t += steps
        
        return iterations, gaps, row_counts_history, col_counts_history
