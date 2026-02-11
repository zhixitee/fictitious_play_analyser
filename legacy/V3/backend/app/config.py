"""Application configuration."""
import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS
    cors_origins: List[str] = ["http://localhost:8888"]
    
    # Simulation limits (proof-of-concept constraints)
    max_iterations: int = 100_000
    max_batch_size: int = 10
    max_matrix_size: int = 20
    default_chunk_size: int = 100
    
    # Job management
    job_ttl_seconds: int = 3600  # 1 hour
    max_concurrent_jobs: int = 3
    
    class Config:
        env_file = ".env"
        env_prefix = "FP_"


settings = Settings()
