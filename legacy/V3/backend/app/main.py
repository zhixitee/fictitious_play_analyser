from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes import jobs_router, ws_router

app = FastAPI(
    title="Fictitious Play Convergence API",
    description="WebSocket-first API for simulating Fictitious Play convergence in zero-sum games",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "service": "Fictitious Play Convergence API",
        "version": "1.0.0",
        "status": "healthy",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    from .job_manager import job_manager
    jobs = await job_manager.list_jobs()
    
    return {
        "status": "healthy",
        "jobs": {
            "total": len(jobs),
            "active": sum(1 for j in jobs if j.status.value in ("pending", "running"))
        },
        "limits": {
            "max_iterations": settings.max_iterations,
            "max_batch_size": settings.max_batch_size,
            "max_matrix_size": settings.max_matrix_size
        }
    }
