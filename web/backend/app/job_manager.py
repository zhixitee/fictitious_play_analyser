"""
In-memory job state management.

Single-user proof-of-concept implementation.
For production, replace with Redis or database-backed state.
"""
import asyncio
import time
import uuid
from typing import Dict, Optional, List, Any
from dataclasses import dataclass, field

from .models import JobStatus, JobCreateRequest, JobInfo, JobSummary


@dataclass
class JobState:
    """Internal state for a simulation job."""
    job_id: str
    config: JobCreateRequest
    status: JobStatus = JobStatus.PENDING
    
    # Timing
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    # Progress tracking
    current_iteration: int = 0
    
    # Results (populated during execution)
    all_gaps: List[List[float]] = field(default_factory=list)
    all_iterations: List[int] = field(default_factory=list)
    matrices: List[Any] = field(default_factory=list)
    
    # Optional heavy data (if include_strategies=True)
    row_counts: Optional[List[List[Any]]] = None
    col_counts: Optional[List[List[Any]]] = None
    
    # Final summary
    summary: Optional[JobSummary] = None
    
    # Cancellation flag
    cancel_requested: bool = False
    
    # Error info
    error_message: Optional[str] = None
    
    def to_info(self) -> JobInfo:
        """Convert to public JobInfo model."""
        return JobInfo(
            job_id=self.job_id,
            status=self.status,
            mode=self.config.mode,
            batch_size=self.config.batch_size,
            iterations=self.config.iterations,
            created_at=self.created_at,
            started_at=self.started_at,
            completed_at=self.completed_at
        )


class JobManager:
    """
    Manages simulation job lifecycle.
    
    Thread-safe for asyncio context.
    """
    
    def __init__(self, max_jobs: int = 10, job_ttl: int = 3600):
        self._jobs: Dict[str, JobState] = {}
        self._max_jobs = max_jobs
        self._job_ttl = job_ttl
        self._lock = asyncio.Lock()
    
    async def create_job(self, config: JobCreateRequest) -> JobState:
        """Create a new job and return its state."""
        async with self._lock:
            # Cleanup expired jobs
            await self._cleanup_expired()
            
            # Check capacity
            active_count = sum(
                1 for j in self._jobs.values() 
                if j.status in (JobStatus.PENDING, JobStatus.RUNNING)
            )
            if active_count >= self._max_jobs:
                raise RuntimeError(f"Maximum concurrent jobs ({self._max_jobs}) reached")
            
            # Create job
            job_id = str(uuid.uuid4())[:8]
            job = JobState(job_id=job_id, config=config)
            
            # Initialize storage based on config
            if config.include_strategies:
                job.row_counts = []
                job.col_counts = []
            
            self._jobs[job_id] = job
            return job
    
    async def get_job(self, job_id: str) -> Optional[JobState]:
        """Get job by ID."""
        return self._jobs.get(job_id)
    
    async def update_status(self, job_id: str, status: JobStatus):
        """Update job status."""
        async with self._lock:
            if job_id in self._jobs:
                job = self._jobs[job_id]
                job.status = status
                if status == JobStatus.RUNNING and job.started_at is None:
                    job.started_at = time.time()
                elif status in (JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.FAILED):
                    job.completed_at = time.time()
    
    async def request_cancel(self, job_id: str) -> bool:
        """Request job cancellation."""
        async with self._lock:
            if job_id in self._jobs:
                job = self._jobs[job_id]
                if job.status in (JobStatus.PENDING, JobStatus.RUNNING):
                    job.cancel_requested = True
                    return True
            return False
    
    async def set_summary(self, job_id: str, summary: JobSummary):
        """Set final job summary."""
        async with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].summary = summary
    
    async def set_error(self, job_id: str, error: str):
        """Set job error message."""
        async with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].error_message = error
                self._jobs[job_id].status = JobStatus.FAILED
                self._jobs[job_id].completed_at = time.time()
    
    async def list_jobs(self) -> List[JobInfo]:
        """List all jobs."""
        return [job.to_info() for job in self._jobs.values()]
    
    async def _cleanup_expired(self):
        """Remove expired completed jobs."""
        now = time.time()
        expired = [
            job_id for job_id, job in self._jobs.items()
            if job.completed_at and (now - job.completed_at) > self._job_ttl
        ]
        for job_id in expired:
            del self._jobs[job_id]


# Global singleton instance
job_manager = JobManager()
