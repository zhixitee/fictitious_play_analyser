import numpy as np
from numba import njit

@njit(fastmath=True)
def fp_step_chunk(payoff_matrix, count_row, count_col, start_t, steps):
    # Runs T steps of fictitious play with best-response selection. Updates counts in-place.
    n, m = payoff_matrix.shape
    gaps = np.zeros(steps, dtype=np.float64)
    
    row_strategy = np.zeros(n, dtype=np.float64)
    col_strategy = np.zeros(m, dtype=np.float64)
    
    for i in range(steps):
        t = start_t + i
        
        for r in range(n): row_strategy[r] = count_row[r] / t
        for c in range(m): col_strategy[c] = count_col[c] / t
        
        row_payoffs = np.dot(payoff_matrix, col_strategy)
        col_payoffs = np.dot(row_strategy, payoff_matrix)
        
        max_row = np.max(row_payoffs)
        min_col = np.min(col_payoffs)
        gaps[i] = max_row - min_col
        
        idx_row = np.argmax(row_payoffs)
        idx_col = np.argmin(col_payoffs)
        
        count_row[idx_row] += 1.0
        count_col[idx_col] += 1.0
        
    return gaps

class FPSolver:
    def __init__(self, matrix):
        self.matrix = matrix.astype(np.float64)
        self.n, self.m = self.matrix.shape
        
        self.count_row = np.zeros(self.n, dtype=np.float64)
        self.count_col = np.zeros(self.m, dtype=np.float64)
        self.count_row[0] = 1.0
        self.count_col[0] = 1.0
        
        self.current_t = 1

    def step(self, steps=100):
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
            
            idx_row = np.argmax(row_payoffs)
            idx_col = np.argmin(col_payoffs)
            
            self.count_row[idx_row] += 1.0
            self.count_col[idx_col] += 1.0
            
            row_counts_history.append(self.count_row.copy())
            col_counts_history.append(self.count_col.copy())
        
        iterations = np.arange(self.current_t, self.current_t + steps)
        self.current_t += steps
        
        return iterations, gaps, row_counts_history, col_counts_history