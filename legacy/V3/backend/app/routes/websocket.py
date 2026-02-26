import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..models import (
    JobCreateRequest, WSJobCreated, WSProgress, WSCompleted, 
    WSCancelled, WSError, JobStatus
)
from ..job_manager import job_manager, JobState
from ..worker import SimulationWorker

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.running_tasks: dict[str, asyncio.Task] = {}
    
    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[job_id] = websocket
    
    def disconnect(self, job_id: str):
        self.active_connections.pop(job_id, None)
        if job_id in self.running_tasks:
            self.running_tasks[job_id].cancel()
            del self.running_tasks[job_id]
    
    async def send_message(self, job_id: str, message: BaseModel):
        if job_id in self.active_connections:
            try:
                await self.active_connections[job_id].send_json(message.model_dump())
            except Exception:
                self.disconnect(job_id)


manager = ConnectionManager()


@router.websocket("/ws/simulation/{job_id}")
async def simulation_websocket(websocket: WebSocket, job_id: str):
    job = await job_manager.get_job(job_id)
    if not job:
        await websocket.close(code=4004, reason="Job not found")
        return
    
    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        await websocket.close(code=4003, reason=f"Job already {job.status.value}")
        return

    await manager.connect(job_id, websocket)

    try:
        await manager.send_message(job_id, WSJobCreated(
            job_id=job_id,
            config=job.config.model_dump()
        ))

        worker = SimulationWorker(
            job=job,
            on_progress=lambda msg: manager.send_message(job_id, msg),
            on_complete=lambda msg: manager.send_message(job_id, msg),
            on_cancel=lambda msg: manager.send_message(job_id, msg),
            on_error=lambda msg: manager.send_message(job_id, msg)
        )

        simulation_task = asyncio.create_task(worker.run())
        manager.running_tasks[job_id] = simulation_task

        async def listen_for_commands():
            try:
                while True:
                    data = await websocket.receive_json()
                    if data.get("action") == "cancel":
                        await job_manager.request_cancel(job_id)
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        listen_task = asyncio.create_task(listen_for_commands())
        
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
        finally:
            listen_task.cancel()
            try:
                await listen_task
            except asyncio.CancelledError:
                pass
    
    except WebSocketDisconnect:
        await job_manager.request_cancel(job_id)
    
    except Exception as e:
        await manager.send_message(job_id, WSError(
            job_id=job_id,
            error="WebSocket error",
            details=str(e)
        ))
    
    finally:
        manager.disconnect(job_id)


@router.websocket("/ws/quick")
async def quick_simulation_websocket(websocket: WebSocket):
    """Create job and start immediately. Client sends config as first message."""
    await websocket.accept()
    
    job_id = None
    
    try:
        config_data = await websocket.receive_json()
        config = JobCreateRequest(**config_data)

        job = await job_manager.create_job(config)
        job_id = job.job_id

        manager.active_connections[job_id] = websocket

        await manager.send_message(job_id, WSJobCreated(
            job_id=job_id,
            config=config.model_dump()
        ))

        worker = SimulationWorker(
            job=job,
            on_progress=lambda msg: manager.send_message(job_id, msg),
            on_complete=lambda msg: manager.send_message(job_id, msg),
            on_cancel=lambda msg: manager.send_message(job_id, msg),
            on_error=lambda msg: manager.send_message(job_id, msg)
        )
        
        simulation_task = asyncio.create_task(worker.run())
        manager.running_tasks[job_id] = simulation_task

        async def listen_for_commands():
            try:
                while True:
                    data = await websocket.receive_json()
                    if data.get("action") == "cancel":
                        await job_manager.request_cancel(job_id)
            except (WebSocketDisconnect, Exception):
                pass
        
        listen_task = asyncio.create_task(listen_for_commands())
        
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
        finally:
            listen_task.cancel()
    
    except WebSocketDisconnect:
        if job_id:
            await job_manager.request_cancel(job_id)
    
    except Exception as e:
        if job_id:
            await manager.send_message(job_id, WSError(
                job_id=job_id,
                error="Simulation error",
                details=str(e)
            ))
        else:
            try:
                await websocket.send_json(WSError(
                    error="Configuration error",
                    details=str(e)
                ).model_dump())
            except:
                pass
    
    finally:
        if job_id:
            manager.disconnect(job_id)
