import numpy as np


class GameFactory:

    @staticmethod
    def get_wang_2025():
        # Wang (2025) lower bound: augmented RPS achieving Ω(t^(-1/3)) convergence.
        A_rps = np.array([
            [0, -1, 1], 
            [1, 0, -1], 
            [-1, 1, 0]
        ], dtype=np.float64)
        
        B = -1/900 * np.array([
            [71, 54, 75], 
            [54, 21, 25], 
            [75, 25, 50]
        ], dtype=np.float64)
        
        M = np.block([
            [A_rps, B, -B],
            [-B, A_rps, B],
            [B, -B, A_rps]
        ])
        
        U0 = np.array([
            460/27, 136/27, 460/27, 
            -169687/2700, -67513/2700, -1357/27, 
            -5, 17, 12
        ])
        
        delta = 1/2700
        U0_hat = U0 + (169687/2700) + np.array([2*delta, delta, 0]*3)
        
        M_aug = np.zeros((10, 10))
        M_aug[0, 1:] = -U0_hat
        M_aug[1:, 0] = U0_hat
        M_aug[1:, 1:] = M
        
        return M_aug

    @staticmethod
    def get_random_game(n_rows, m_cols, seed):
        rng = np.random.default_rng(seed)
        
        if n_rows == m_cols:
            mat = rng.uniform(-1, 1, size=(n_rows, n_rows))
            return (mat - mat.T) / 2
        
        return rng.uniform(-1, 1, size=(n_rows, m_cols))
