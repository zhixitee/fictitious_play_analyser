"""REST API endpoints for job management."""
import csv
import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..models import (
    JobCreateRequest, JobCreateResponse, JobInfo, JobSummary,
    JobStatus, ExportInfo
)
from ..job_manager import job_manager

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/", response_model=JobCreateResponse)
async def create_job(request: JobCreateRequest):
    """
    Create a new simulation job.
    
    Returns job ID and WebSocket URL for streaming progress.
    The actual simulation starts when a WebSocket connection is established.
    """
    try:
        job = await job_manager.create_job(request)
        return JobCreateResponse(
            job_id=job.job_id,
            status=job.status,
            message="Job created. Connect to WebSocket to start simulation.",
            websocket_url=f"/ws/simulation/{job.job_id}"
        )
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))


@router.get("/", response_model=list[JobInfo])
async def list_jobs():
    """List all jobs."""
    return await job_manager.list_jobs()


@router.get("/{job_id}", response_model=JobInfo)
async def get_job(job_id: str):
    """Get job information."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_info()


@router.get("/{job_id}/summary", response_model=JobSummary)
async def get_job_summary(job_id: str):
    """Get final summary for a completed job."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Job not completed (status: {job.status})")
    if not job.summary:
        raise HTTPException(status_code=500, detail="Summary not available")
    return job.summary


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Request job cancellation."""
    success = await job_manager.request_cancel(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or not cancellable")
    return {"message": "Cancellation requested", "job_id": job_id}


@router.get("/{job_id}/export", response_model=ExportInfo)
async def get_export_info(job_id: str):
    """Get available export options for a job."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
    
    return ExportInfo(
        job_id=job_id,
        formats=["csv", "md"],
        iterations_count=len(job.all_iterations),
        games_count=len(job.all_gaps)
    )


@router.get("/{job_id}/export/csv")
async def export_csv(job_id: str):
    """Download simulation data as CSV."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
    
    # Generate CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(['# Fictitious Play Simulation Data'])
    writer.writerow([f'# Job ID: {job_id}'])
    writer.writerow([f'# Seed: {job.config.seed}'])
    writer.writerow([f'# Total Iterations: {len(job.all_iterations)}'])
    writer.writerow([f'# Number of Games: {len(job.all_gaps)}'])
    writer.writerow([])
    writer.writerow(['Game', 'Iteration', 'Gap'])
    
    # Data rows
    for game_idx in range(len(job.all_gaps)):
        for iter_idx, t in enumerate(job.all_iterations):
            if iter_idx < len(job.all_gaps[game_idx]):
                gap = job.all_gaps[game_idx][iter_idx]
                writer.writerow([game_idx + 1, t, f"{gap:.6e}"])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=simulation_{job_id}.csv"}
    )


@router.get("/{job_id}/export/md")
async def export_markdown(job_id: str):
    """Download simulation data as Markdown."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
    
    # Generate Markdown
    lines = [
        f"# Fictitious Play Simulation Results",
        f"",
        f"**Job ID:** {job_id}",
        f"**Seed:** {job.config.seed}",
        f"**Mode:** {job.config.mode.value}",
        f"**Total Iterations:** {len(job.all_iterations):,}",
        f"**Number of Games:** {len(job.all_gaps)}",
        f"",
    ]
    
    if job.summary:
        lines.extend([
            f"## Summary Statistics",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Gap Mean | {job.summary.gap_mean:.6e} |",
            f"| Gap Median | {job.summary.gap_median:.6e} |",
            f"| Gap Min | {job.summary.gap_min:.6e} |",
            f"| Gap Max | {job.summary.gap_max:.6e} |",
            f"| Karlin Ratio Mean | {job.summary.ratio_mean:.4f} |",
            f"| Theoretical Bound | {job.summary.theoretical_bound:.6e} |",
            f"| Ratio to Theory | {job.summary.ratio_to_theory:.4f} |",
            f"| Execution Time | {job.summary.execution_time_seconds:.2f}s |",
            f"",
        ])
    
    # Sample data
    lines.extend([
        f"## Sample Data (every 100th iteration)",
        f"",
        f"| Game | Iteration | Gap |",
        f"|------|-----------|-----|",
    ])
    
    sample_rate = max(1, len(job.all_iterations) // 100)
    for game_idx in range(len(job.all_gaps)):
        for iter_idx in range(0, len(job.all_iterations), sample_rate):
            if iter_idx < len(job.all_gaps[game_idx]):
                t = job.all_iterations[iter_idx]
                gap = job.all_gaps[game_idx][iter_idx]
                lines.append(f"| {game_idx + 1} | {t:,} | {gap:.6e} |")
    
    content = "\n".join(lines)
    
    return StreamingResponse(
        iter([content]),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=simulation_{job_id}.md"}
    )
