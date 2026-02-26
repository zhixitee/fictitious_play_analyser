from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator
import time
import uuid


class SimulationMode(str, Enum):
    RANDOM = "random"
    MIXED = "mixed"
    CUSTOM = "custom"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class WSMessageType(str, Enum):
    JOB_CREATED = "job_created"
    PROGRESS = "progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"


class JobCreateRequest(BaseModel):
    mode: SimulationMode = SimulationMode.RANDOM
    batch_size: int = Field(default=3, ge=1, le=10)
    iterations: int = Field(default=1000, ge=1, le=10000)
    chunk_size: int = Field(default=10, ge=1, le=10)
    seed: Optional[int] = Field(default=None, ge=0, le=99999)

    mixed_sizes: Optional[List[int]] = Field(default=[3, 5, 7])
    custom_matrix: Optional[List[List[float]]] = Field(default=None)

    include_strategies: bool = Field(default=False)
    
    @field_validator('mixed_sizes')
    @classmethod
    def validate_mixed_sizes(cls, v):
        if v is not None:
            if not all(2 <= s <= 20 for s in v):
                raise ValueError("All sizes must be between 2 and 20")
        return v
    
    @field_validator('custom_matrix')
    @classmethod
    def validate_custom_matrix(cls, v):
        if v is not None:
            rows = len(v)
            if rows < 2 or rows > 20:
                raise ValueError("Matrix must have 2-20 rows")
            cols = len(v[0]) if v else 0
            if cols < 2 or cols > 20:
                raise ValueError("Matrix must have 2-20 columns")
            if not all(len(row) == cols for row in v):
                raise ValueError("All rows must have same length")
        return v


class JobInfo(BaseModel):
    job_id: str
    status: JobStatus
    mode: SimulationMode
    batch_size: int
    iterations: int
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class JobCreateResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
    websocket_url: str


class JobSummary(BaseModel):
    job_id: str
    status: JobStatus
    total_iterations: int
    games_count: int
    
    gap_mean: float
    gap_median: float
    gap_min: float
    gap_max: float
    gap_std: float

    ratio_mean: float
    ratio_median: float
    ratio_min: float
    ratio_max: float
    ratio_std: float

    theoretical_bound: float
    ratio_to_theory: float

    execution_time_seconds: float


class ExportInfo(BaseModel):
    job_id: str
    formats: List[str] = ["csv", "md"]
    iterations_count: int
    games_count: int


class WSJobCreated(BaseModel):
    type: WSMessageType = WSMessageType.JOB_CREATED
    job_id: str
    config: Dict[str, Any]
    matrices: Optional[List[List[List[float]]]] = None
    timestamp: float = Field(default_factory=time.time)


class WSProgress(BaseModel):
    """Delta-based progress update sent once per chunk. Contains only incremental data."""
    type: WSMessageType = WSMessageType.PROGRESS
    job_id: str

    current_iteration: int
    total_iterations: int
    progress_pct: float

    chunk_start: int
    chunk_size: int

    chunk_gaps: List[float]
    avg_gap: float

    iterations: Optional[List[int]] = None
    detailed_gaps: Optional[List[List[float]]] = None
    row_strategies: Optional[List[List[float]]] = None
    col_strategies: Optional[List[List[float]]] = None
    matrices: Optional[List[List[List[float]]]] = None
    
    timestamp: float = Field(default_factory=time.time)


class WSCompleted(BaseModel):
    type: WSMessageType = WSMessageType.COMPLETED
    job_id: str
    summary: JobSummary
    timestamp: float = Field(default_factory=time.time)


class WSCancelled(BaseModel):
    type: WSMessageType = WSMessageType.CANCELLED
    job_id: str
    reason: str
    iterations_completed: int
    timestamp: float = Field(default_factory=time.time)


class WSError(BaseModel):
    type: WSMessageType = WSMessageType.ERROR
    job_id: Optional[str] = None
    error: str
    details: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)


WSMessage = Union[WSJobCreated, WSProgress, WSCompleted, WSCancelled, WSError]
