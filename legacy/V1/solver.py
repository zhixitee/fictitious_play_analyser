import numpy as np
from numba import njit

@njit(fastmath=True)
def fp_step_chunk(payoff_matrix, count_row, count_col, start_t, steps):
    """
    Fictitious Play algorithm for zero-sum games (Brown 1951, Robinson 1951).
    
    Algorithm (as defined in Robinson [6]):
    1. Players maintain count vectors of opponent's past actions
    2. Empirical strategy: σ_i(t) = count_i / t (average over history)
    3. Each player best-responds to opponent's empirical strategy
    4. Duality gap: Gap(t) = max_i(A·σ_col)_i - min_j(σ_row·A)_j
    
    Theoretical bounds:
    - Robinson/Shapiro [6,7]: O(T^(-1/(2n-2))) where n = # strategies
    - Karlin's conjecture [8]: O(T^(-1/2)) independent of n
    - Wang's lower bound: Ω(T^(-1/3)) for specific games
    
    Updates count arrays IN-PLACE for memory efficiency.
    Returns the duality gaps for this chunk.
    """
    n, m = payoff_matrix.shape
    gaps = np.zeros(steps, dtype=np.float64)
    
    # Pre-allocate strategy vectors to avoid allocation inside loop
    row_strategy = np.zeros(n, dtype=np.float64)
    col_strategy = np.zeros(m, dtype=np.float64)
    
    for i in range(steps):
        t = start_t + i
        
        # 1. Compute Mixed Strategies (Counts / t)
        # Numba handles vector division efficiently
        for r in range(n): row_strategy[r] = count_row[r] / t
        for c in range(m): col_strategy[c] = count_col[c] / t
        
        # 2. Compute Expected Payoffs
        # Row payoffs = A * col_strategy
        row_payoffs = np.dot(payoff_matrix, col_strategy)
        # Col payoffs = row_strategy * A
        col_payoffs = np.dot(row_strategy, payoff_matrix)
        
        # 3. Best Responses & Gap
        max_row = np.max(row_payoffs)
        min_col = np.min(col_payoffs)
        gaps[i] = max_row - min_col
        
        # 4. Update Counts
        # Row chooses max index, Col chooses min index
        idx_row = np.argmax(row_payoffs)
        idx_col = np.argmin(col_payoffs)
        
        count_row[idx_row] += 1.0
        count_col[idx_col] += 1.0
        
    return gaps

class FPSolver:
    def __init__(self, matrix):
        self.matrix = matrix.astype(np.float64)
        self.n, self.m = self.matrix.shape
        
        # Initialize counts (start with action 0)
        self.count_row = np.zeros(self.n, dtype=np.float64)
        self.count_col = np.zeros(self.m, dtype=np.float64)
        self.count_row[0] = 1.0
        self.count_col[0] = 1.0
        
        self.current_t = 1 # We start having played 1 round (initialization)

    def step(self, steps=100):
        """
        Advances the simulation by `steps` iterations.
        Returns: (iterations_array, gaps_array)
        """
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
        """
        Advances the simulation by `steps` iterations and records count vectors at each step.
        Returns: (iterations_array, gaps_array, row_counts_history, col_counts_history)
        """
        n, m = self.matrix.shape
        gaps = np.zeros(steps, dtype=np.float64)
        row_counts_history = []
        col_counts_history = []
        
        row_strategy = np.zeros(n, dtype=np.float64)
        col_strategy = np.zeros(m, dtype=np.float64)
        
        for i in range(steps):
            t = self.current_t + i
            
            # Compute strategies
            for r in range(n):
                row_strategy[r] = self.count_row[r] / t
            for c in range(m):
                col_strategy[c] = self.count_col[c] / t
            
            # Compute payoffs
            row_payoffs = np.dot(self.matrix, col_strategy)
            col_payoffs = np.dot(row_strategy, self.matrix)
            
            # Calculate gap
            gaps[i] = np.max(row_payoffs) - np.min(col_payoffs)
            
            # Best responses
            idx_row = np.argmax(row_payoffs)
            idx_col = np.argmin(col_payoffs)
            
            # Update counts
            self.count_row[idx_row] += 1.0
            self.count_col[idx_col] += 1.0
            
            # Store count vectors after update
            row_counts_history.append(self.count_row.copy())
            col_counts_history.append(self.count_col.copy())
        
        iterations = np.arange(self.current_t, self.current_t + steps)
        self.current_t += steps
        
        return iterations, gaps, row_counts_history, col_counts_history