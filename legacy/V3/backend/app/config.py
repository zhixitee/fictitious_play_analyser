import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    cors_origins: List[str] = ["http://localhost:8888"]

    max_iterations: int = 100_000
    max_batch_size: int = 10
    max_matrix_size: int = 20
    default_chunk_size: int = 100

    job_ttl_seconds: int = 3600
    max_concurrent_jobs: int = 3

    class Config:
        env_file = ".env"
        env_prefix = "FP_"


settings = Settings()
