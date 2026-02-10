"""Pydantic models for API requests, responses, and WebSocket messages."""
from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator
import time
import uuid


# ============================================================================
# Enums
# ============================================================================

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
    """WebSocket message types for the streaming protocol."""
    JOB_CREATED = "job_created"
    PROGRESS = "progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"


# ============================================================================
# Request Models
# ============================================================================

class JobCreateRequest(BaseModel):
    """Request to create a new simulation job."""
    
    mode: SimulationMode = SimulationMode.RANDOM
    batch_size: int = Field(default=3, ge=1, le=10)
    iterations: int = Field(default=1000, ge=1, le=10000)
    chunk_size: int = Field(default=10, ge=1, le=10)
    seed: Optional[int] = Field(default=None, ge=0, le=99999)
    
    # Mode-specific configuration
    mixed_sizes: Optional[List[int]] = Field(
        default=[3, 5, 7],
        description="Matrix sizes for mixed mode"
    )
    custom_matrix: Optional[List[List[float]]] = Field(
        default=None,
        description="Custom payoff matrix (2-20 rows/cols)"
    )
    
    # Streaming options
    include_strategies: bool = Field(
        default=False,
        description="Include row/column strategy histories (heavy data)"
    )
    
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


# ============================================================================
# Response Models
# ============================================================================

class JobInfo(BaseModel):
    """Basic job information."""
    job_id: str
    status: JobStatus
    mode: SimulationMode
    batch_size: int
    iterations: int
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class JobCreateResponse(BaseModel):
    """Response when a job is created."""
    job_id: str
    status: JobStatus
    message: str
    websocket_url: str


class JobSummary(BaseModel):
    """Final summary statistics for a completed job."""
    job_id: str
    status: JobStatus
    total_iterations: int
    games_count: int
    
    # Gap statistics
    gap_mean: float
    gap_median: float
    gap_min: float
    gap_max: float
    gap_std: float
    
    # Karlin's ratio statistics
    ratio_mean: float
    ratio_median: float
    ratio_min: float
    ratio_max: float
    ratio_std: float
    
    # Theoretical comparison
    theoretical_bound: float
    ratio_to_theory: float
    
    # Timing
    execution_time_seconds: float


class ExportInfo(BaseModel):
    """Information about available exports."""
    job_id: str
    formats: List[str] = ["csv", "md"]
    iterations_count: int
    games_count: int


# ============================================================================
# WebSocket Message Models (Delta-based Protocol)
# ============================================================================

class WSJobCreated(BaseModel):
    """Sent when job is accepted and queued."""
    type: WSMessageType = WSMessageType.JOB_CREATED
    job_id: str
    config: Dict[str, Any]
    matrices: Optional[List[List[List[float]]]] = None  # [game][row][col] payoff matrices
    timestamp: float = Field(default_factory=time.time)


class WSProgress(BaseModel):
    """
    Delta-based progress update sent once per chunk.
    Contains only incremental data for this chunk.
    """
    type: WSMessageType = WSMessageType.PROGRESS
    job_id: str
    
    # Progress tracking
    current_iteration: int
    total_iterations: int
    progress_pct: float
    
    # Chunk data (delta - only this chunk's values)
    chunk_start: int  # Starting iteration of this chunk
    chunk_size: int   # Number of iterations in this chunk
    
    # Per-game gap values for this chunk (append to client-side arrays)
    # Shape: [batch_size] - final gap value of this chunk per game
    chunk_gaps: List[float]
    
    # Average gap across all games for this chunk
    avg_gap: float
    
    # Optional: iteration numbers for this chunk (for x-axis)
    iterations: Optional[List[int]] = None
    
    # Optional: full gap series for this chunk (heavy - disabled by default)
    # Shape: [batch_size][chunk_size]
    detailed_gaps: Optional[List[List[float]]] = None
    
    # Strategy data: row and column strategies for each game at this iteration
    # Shape: [batch_size][actions]
    row_strategies: Optional[List[List[float]]] = None
    col_strategies: Optional[List[List[float]]] = None
    
    # Matrices: payoff matrices for each game (sent on first update only)
    # Shape: [batch_size][rows][cols]
    matrices: Optional[List[List[List[float]]]] = None
    
    timestamp: float = Field(default_factory=time.time)


class WSCompleted(BaseModel):
    """Sent when simulation completes successfully."""
    type: WSMessageType = WSMessageType.COMPLETED
    job_id: str
    summary: JobSummary
    timestamp: float = Field(default_factory=time.time)


class WSCancelled(BaseModel):
    """Sent when job is cancelled."""
    type: WSMessageType = WSMessageType.CANCELLED
    job_id: str
    reason: str
    iterations_completed: int
    timestamp: float = Field(default_factory=time.time)


class WSError(BaseModel):
    """Sent when an error occurs."""
    type: WSMessageType = WSMessageType.ERROR
    job_id: Optional[str] = None
    error: str
    details: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)


# Union type for all WebSocket messages
WSMessage = Union[WSJobCreated, WSProgress, WSCompleted, WSCancelled, WSError]
