"""Background worker thread for non-blocking simulation execution."""
import numpy as np
from PyQt5.QtCore import QThread, pyqtSignal

from ..core import FPSolver, GameFactory


class SimulationWorker(QThread):
    """Execute simulation in background without blocking UI."""
    
    update_signal = pyqtSignal(dict)
    finished_signal = pyqtSignal(dict)
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.running = True
        self.solvers = []
        
    def run(self):
        """Main simulation loop."""
        self._initialize_solvers()
        
        total_iter = self.config['iterations']
        chunk_size = self.config['chunk']
        current_iter = 0
        
        actual_batch = len(self.solvers)
        all_gaps = [[] for _ in range(actual_batch)]
        iterations = []
        all_row_counts = [[] for _ in range(actual_batch)]
        all_col_counts = [[] for _ in range(actual_batch)]
        matrices = [solver.matrix.copy() for solver in self.solvers]
        
        while self.running and current_iter < total_iter:
            batch_gaps = []
            current_iters = None
            
            for i, solver in enumerate(self.solvers):
                iters, gaps, row_counts_history, col_counts_history = solver.step_with_history(steps=chunk_size)
                batch_gaps.append(gaps)
                if current_iters is None:
                    current_iters = iters
                
                all_row_counts[i].extend(row_counts_history)
                all_col_counts[i].extend(col_counts_history)
            
            iterations.extend(current_iters.tolist())
            for i, gaps in enumerate(batch_gaps):
                all_gaps[i].extend(gaps.tolist())
            
            current_iter += chunk_size
            
            gaps_array = np.array(batch_gaps)
            avg_gap = float(np.mean(gaps_array[:, -1]))
            
            self.update_signal.emit({
                'iteration': current_iter,
                'iterations': iterations.copy(),
                'all_gaps': [g.copy() for g in all_gaps],
                'row_counts': [counts.copy() for counts in all_row_counts],
                'col_counts': [counts.copy() for counts in all_col_counts],
                'matrices': matrices,
                'avg_gap': avg_gap,
                'progress': (current_iter / total_iter) * 100
            })
            
            self.msleep(10)
        
        self._emit_final_stats(current_iter, all_gaps)
    
    def _initialize_solvers(self):
        """Create solver instances based on configuration."""
        mode = self.config['mode']
        batch_size = self.config['batch']
        seed = self.config['seed']
        
        if mode == 'custom':
            custom_matrix = self.config.get('custom_matrix')
            if custom_matrix is not None:
                self.solvers.append(FPSolver(custom_matrix))
            else:
                mat = np.array([[0.0, -1.0], [1.0, 0.0]])
                self.solvers.append(FPSolver(mat))
        
        elif mode == 'mixed':
            sizes = self.config['sizes']
            size_idx = 0
            for i in range(batch_size):
                size = sizes[size_idx % len(sizes)]
                mat = GameFactory.get_random_game(size, size, seed=seed + i)
                self.solvers.append(FPSolver(mat))
                size_idx += 1
        
        else:  # random
            for i in range(batch_size):
                mat = GameFactory.get_random_game(10, 10, seed=seed + i)
                self.solvers.append(FPSolver(mat))
    
    def _emit_final_stats(self, current_iter, all_gaps):
        """Calculate and emit final statistics."""
        final_gaps = np.array([g[-1] for g in all_gaps])
        karlins_ratios = final_gaps * np.sqrt(current_iter)
        
        self.finished_signal.emit({
            'total_iterations': current_iter,
            'gap_mean': float(np.mean(final_gaps)),
            'gap_median': float(np.median(final_gaps)),
            'gap_min': float(np.min(final_gaps)),
            'gap_max': float(np.max(final_gaps)),
            'gap_std': float(np.std(final_gaps)),
            'ratio_mean': float(np.mean(karlins_ratios)),
            'ratio_median': float(np.median(karlins_ratios)),
            'ratio_min': float(np.min(karlins_ratios)),
            'ratio_max': float(np.max(karlins_ratios)),
            'ratio_std': float(np.std(karlins_ratios)),
            'theoretical_bound': float(1 / np.sqrt(current_iter)),
            'ratio_to_theory': float(np.mean(final_gaps) / (1 / np.sqrt(current_iter)))
        })
    
    def stop(self):
        """Stop the simulation."""
        self.running = False
