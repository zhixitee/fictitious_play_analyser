# Fictitious Play Web Application

Web-based interface for the Fictitious Play Convergence Analyzer with real-time WebSocket streaming.

## Architecture

```
web/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # FastAPI entry point
│   │   ├── config.py          # Configuration management
│   │   ├── models.py          # Pydantic schemas & WS protocol
│   │   ├── job_manager.py     # In-memory job state
│   │   ├── worker.py          # Background simulation execution
│   │   └── routes/
│   │       ├── jobs.py        # REST endpoints
│   │       └── websocket.py   # WebSocket handlers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React + TypeScript
│   ├── src/
│   │   ├── App.tsx            # Main application
│   │   ├── hooks/
│   │   │   └── useSimulation.ts   # WebSocket state management
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx   # Simulation controls
│   │   │   ├── ProgressDisplay.tsx # Status & summary
│   │   │   ├── GapChart.tsx       # Real-time visualization
│   │   │   └── MatrixEditor.tsx   # Custom matrix input
│   │   └── types/
│   │       └── simulation.ts      # TypeScript definitions
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

## Quick Start

### Local Development

```bash
# Backend (from web/backend directory)
cd web/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (from web/frontend directory)
cd web/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Docker Compose

```bash
# Development mode (with hot reload)
cd web
docker-compose --profile dev up

# Production mode
docker-compose up --build
```

## WebSocket Protocol

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `job_created` | Server → Client | Job accepted, simulation starting |
| `progress` | Server → Client | Chunk completion with delta data |
| `completed` | Server → Client | Simulation finished with summary |
| `cancelled` | Server → Client | Job cancelled by user |
| `error` | Server → Client | Error occurred |

### Delta-Based Streaming

Progress updates are **append-only** and contain only incremental data:

```json
{
  "type": "progress",
  "job_id": "abc123",
  "current_iteration": 1000,
  "total_iterations": 10000,
  "progress_pct": 10.0,
  "chunk_start": 900,
  "chunk_size": 100,
  "chunk_gaps": [0.0523, 0.0481, 0.0498],
  "avg_gap": 0.0501,
  "timestamp": 1706543210.123
}
```

The client accumulates `chunk_gaps` into arrays for each game, avoiding full data retransmission.

### WebSocket Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ws/simulation/{job_id}` | Connect to existing job |
| `/ws/quick` | Create job and start immediately |

### Client Actions

```json
{ "action": "cancel" }
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/` | Create new job |
| `GET` | `/api/jobs/` | List all jobs |
| `GET` | `/api/jobs/{id}` | Get job info |
| `GET` | `/api/jobs/{id}/summary` | Get final summary |
| `POST` | `/api/jobs/{id}/cancel` | Request cancellation |
| `GET` | `/api/jobs/{id}/export/csv` | Download CSV |
| `GET` | `/api/jobs/{id}/export/md` | Download Markdown |

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FP_HOST` | `0.0.0.0` | Server host |
| `FP_PORT` | `8000` | Server port |
| `FP_DEBUG` | `false` | Debug mode |
| `FP_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed origins |
| `FP_MAX_ITERATIONS` | `100000` | Max iterations limit |
| `FP_MAX_BATCH_SIZE` | `10` | Max games per job |
| `FP_MAX_CONCURRENT_JOBS` | `3` | Concurrent job limit |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `""` | API base URL (same-origin) |
| `VITE_WS_URL` | `""` | WebSocket URL (auto-detect) |

## Deployment

### Vercel Deployment

**Important:** Vercel Serverless Functions have limitations that affect this application:

1. **WebSocket Timeout:** Edge Runtime WebSockets have a 30-second idle timeout
2. **Execution Time:** Maximum 10s (Hobby) or 60s (Pro) per request
3. **No Background Tasks:** Serverless doesn't support long-running processes

**Recommended Vercel Setup:**

```
Frontend: Deploy to Vercel (static site)
Backend: Deploy to Railway, Render, or Fly.io
```

**Frontend Deployment (Vercel):**

1. Connect your repo to Vercel
2. Set root directory to `web/frontend`
3. Set environment variables:
   ```
   VITE_API_URL=https://your-backend.railway.app
   VITE_WS_URL=wss://your-backend.railway.app
   ```

### Railway/Render Deployment (Backend)

```bash
# Railway
railway init
railway up --dockerfile web/backend/Dockerfile

# Or Render
# Create new Web Service pointing to web/backend
```

### Local Docker Production

```bash
cd web
docker-compose up --build -d

# Access at http://localhost
# API at http://localhost:8000
```

## Compute Philosophy

This is a **proof-of-concept** designed for:

- ✅ Small simulations on the server (≤50k iterations)
- ✅ Quick demos and experimentation
- ✅ Single-user scenarios

For production workloads, the architecture supports:

1. **Local Backend Mode:** Run the same API locally
   ```bash
   cd web/backend
   uvicorn app.main:app --port 8000
   # Point frontend to localhost:8000
   ```

2. **Client-Side Execution (Future):** The WebSocket protocol is designed to allow future client-side execution where the browser runs the solver and streams results back.

## Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **WebSockets** - Real-time bidirectional communication
- **Pydantic** - Data validation and serialization
- **NumPy/Numba** - High-performance numerical computation

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Recharts** - Charting library
- **Tailwind CSS** - Utility-first styling
- **Vite** - Build tool

## Development

### Backend Testing

```bash
cd web/backend
pip install pytest httpx pytest-asyncio
pytest
```

### Frontend Testing

```bash
cd web/frontend
npm run lint
npm run build
```

### Type Checking

```bash
# Frontend
cd web/frontend
npx tsc --noEmit
```
