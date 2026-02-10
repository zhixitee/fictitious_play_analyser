"""
Background worker for simulation execution.

Runs CPU-bound Numba code in thread pool to avoid blocking asyncio.
Emits delta-based progress updates via callback.
"""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Awaitable, Optional
import numpy as np

# Import core solver from parent package
import sys
from pathlib import Path

# Add parent directory to path for core imports
root_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(root_dir))

from src.core import FPSolver, GameFactory
from .models import (
    JobCreateRequest, JobStatus, JobSummary,
    WSProgress, WSCompleted, WSCancelled, WSError, SimulationMode
)
from .job_manager import JobState, job_manager


# Thread pool for CPU-bound work
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fp-worker")


class SimulationWorker:
    """
    Executes Fictitious Play simulation with progress streaming.
    
    Design for future extensibility:
    - Same interface can be used for local execution
    - Progress callback abstraction allows different transport layers
    """
    
    def __init__(
        self,
        job: JobState,
        on_progress: Callable[[WSProgress], Awaitable[None]],
        on_complete: Callable[[WSCompleted], Awaitable[None]],
        on_cancel: Callable[[WSCancelled], Awaitable[None]],
        on_error: Callable[[WSError], Awaitable[None]]
    ):
        self.job = job
        self.config = job.config
        self.on_progress = on_progress
        self.on_complete = on_complete
        self.on_cancel = on_cancel
        self.on_error = on_error
        
        self.solvers: list[FPSolver] = []
        self.matrices: list[np.ndarray] = []
    
    async def run(self):
        """Main execution entry point."""
        try:
            await job_manager.update_status(self.job.job_id, JobStatus.RUNNING)
            
            # Initialize solvers (CPU-bound, run in thread)
            await asyncio.get_event_loop().run_in_executor(
                _executor, self._initialize_solvers
            )
            
            # Run simulation loop
            await self._run_simulation_loop()
            
        except asyncio.CancelledError:
            await self._handle_cancellation()
        except Exception as e:
            await self._handle_error(str(e))
    
    def _initialize_solvers(self):
        """Initialize solver instances based on configuration."""
        mode = self.config.mode
        batch_size = self.config.batch_size
        seed = self.config.seed or np.random.randint(0, 99999)
        
        if mode == SimulationMode.CUSTOM:
            if self.config.custom_matrix:
                matrix = np.array(self.config.custom_matrix, dtype=np.float64)
                self.solvers.append(FPSolver(matrix))
                self.matrices.append(matrix)
            else:
                # Default 2x2 zero-sum game
                matrix = np.array([[0.0, -1.0], [1.0, 0.0]], dtype=np.float64)
                self.solvers.append(FPSolver(matrix))
                self.matrices.append(matrix)
        
        elif mode == SimulationMode.MIXED:
            sizes = self.config.mixed_sizes or [3, 5, 7]
            for i in range(batch_size):
                size = sizes[i % len(sizes)]
                matrix = GameFactory.get_random_game(size, size, seed=seed + i)
                self.solvers.append(FPSolver(matrix))
                self.matrices.append(matrix)
        
        else:  # RANDOM
            for i in range(batch_size):
                matrix = GameFactory.get_random_game(10, 10, seed=seed + i)
                self.solvers.append(FPSolver(matrix))
                self.matrices.append(matrix)
        
        # Store matrices in job state
        self.job.matrices = [m.copy() for m in self.matrices]
    
    async def _run_simulation_loop(self):
        """Execute simulation with chunked progress updates."""
        total_iter = self.config.iterations
        chunk_size = self.config.chunk_size
        current_iter = 0
        first_update = True
        
        batch_size = len(self.solvers)
        all_gaps = [[] for _ in range(batch_size)]
        iterations = []
        
        while current_iter < total_iter:
            # Check for cancellation
            if self.job.cancel_requested:
                await self._handle_cancellation()
                return
            
            # Execute chunk (CPU-bound, run in thread)
            chunk_result = await asyncio.get_event_loop().run_in_executor(
                _executor,
                self._execute_chunk,
                chunk_size
            )
            
            # Unpack results
            chunk_iters, chunk_gaps = chunk_result
            current_iter += chunk_size
            
            # Accumulate data
            iterations.extend(chunk_iters)
            for i, gaps in enumerate(chunk_gaps):
                all_gaps[i].extend(gaps)
            
            # Update job state
            self.job.current_iteration = current_iter
            self.job.all_iterations = iterations.copy()
            self.job.all_gaps = [g.copy() for g in all_gaps]
            
            # Calculate chunk statistics
            final_chunk_gaps = [gaps[-1] for gaps in chunk_gaps]
            avg_gap = float(np.mean(final_chunk_gaps))
            
            # Get current strategies for each solver
            row_strategies = []
            col_strategies = []
            for solver in self.solvers:
                t = solver.current_t
                if t > 0:
                    row_strategies.append((solver.count_row / t).tolist())
                    col_strategies.append((solver.count_col / t).tolist())
                else:
                    row_strategies.append(solver.count_row.tolist())
                    col_strategies.append(solver.count_col.tolist())
            
            # Emit progress update (delta-based)
            progress = WSProgress(
                job_id=self.job.job_id,
                current_iteration=current_iter,
                total_iterations=total_iter,
                progress_pct=(current_iter / total_iter) * 100,
                chunk_start=current_iter - chunk_size,
                chunk_size=chunk_size,
                chunk_gaps=final_chunk_gaps,
                avg_gap=avg_gap,
                iterations=list(chunk_iters) if len(chunk_iters) <= 100 else None,
                row_strategies=row_strategies,
                col_strategies=col_strategies,
                matrices=[m.tolist() for m in self.matrices] if first_update else None
            )
            first_update = False
            
            await self.on_progress(progress)
            
            # Small delay to prevent overwhelming the event loop
            await asyncio.sleep(0.01)
        
        # Simulation complete
        await self._finalize(current_iter, all_gaps)
    
    def _execute_chunk(self, chunk_size: int) -> tuple[list[int], list[list[float]]]:
        """Execute one chunk of iterations for all solvers."""
        chunk_gaps = []
        chunk_iters = None
        
        for solver in self.solvers:
            iters, gaps = solver.step(steps=chunk_size)
            chunk_gaps.append(gaps.tolist())
            if chunk_iters is None:
                chunk_iters = iters.tolist()
        
        return chunk_iters, chunk_gaps
    
    async def _finalize(self, total_iter: int, all_gaps: list[list[float]]):
        """Calculate final statistics and emit completion."""
        final_gaps = np.array([g[-1] for g in all_gaps])
        karlins_ratios = final_gaps * np.sqrt(total_iter)
        
        execution_time = time.time() - (self.job.started_at or time.time())
        
        summary = JobSummary(
            job_id=self.job.job_id,
            status=JobStatus.COMPLETED,
            total_iterations=total_iter,
            games_count=len(self.solvers),
            gap_mean=float(np.mean(final_gaps)),
            gap_median=float(np.median(final_gaps)),
            gap_min=float(np.min(final_gaps)),
            gap_max=float(np.max(final_gaps)),
            gap_std=float(np.std(final_gaps)),
            ratio_mean=float(np.mean(karlins_ratios)),
            ratio_median=float(np.median(karlins_ratios)),
            ratio_min=float(np.min(karlins_ratios)),
            ratio_max=float(np.max(karlins_ratios)),
            ratio_std=float(np.std(karlins_ratios)),
            theoretical_bound=float(1 / np.sqrt(total_iter)),
            ratio_to_theory=float(np.mean(final_gaps) / (1 / np.sqrt(total_iter))),
            execution_time_seconds=execution_time
        )
        
        await job_manager.set_summary(self.job.job_id, summary)
        await job_manager.update_status(self.job.job_id, JobStatus.COMPLETED)
        
        await self.on_complete(WSCompleted(
            job_id=self.job.job_id,
            summary=summary
        ))
    
    async def _handle_cancellation(self):
        """Handle job cancellation."""
        await job_manager.update_status(self.job.job_id, JobStatus.CANCELLED)
        
        await self.on_cancel(WSCancelled(
            job_id=self.job.job_id,
            reason="User requested cancellation",
            iterations_completed=self.job.current_iteration
        ))
    
    async def _handle_error(self, error: str):
        """Handle execution error."""
        await job_manager.set_error(self.job.job_id, error)
        
        await self.on_error(WSError(
            job_id=self.job.job_id,
            error="Simulation failed",
            details=error
        ))
