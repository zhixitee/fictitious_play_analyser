# Fictitious Play — Web Application

Browser-based interface for the Fictitious Play Convergence Analyser with real-time WebSocket streaming and in-browser Web Worker execution.

## Architecture

```
web/
├── frontend/                     # React + TypeScript SPA
│   ├── src/
│   │   ├── App.tsx               # Root — resizable three-panel layout
│   │   ├── core/                 # Pure solver engine (no UI deps)
│   │   │   ├── solver.ts         # createSolver(), stepChunk()
│   │   │   ├── games.ts          # Random, RPS, diagonal, Wang 2025
│   │   │   ├── rng.ts            # Mulberry32 seeded PRNG
│   │   │   ├── stats.ts          # Gap & Karlin summary statistics
│   │   │   └── export.ts         # CSV generation
│   │   ├── components/
│   │   │   ├── ControlsPanel.tsx  # Simulation config & run controls
│   │   │   ├── PlotPanel.tsx      # Zoomable duality gap chart
│   │   │   ├── IterationExplorer.tsx  # Per-iteration strategy inspector
│   │   │   ├── MatrixEditor.tsx   # Custom payoff matrix input
│   │   │   ├── StatusPanel.tsx    # Summary statistics
│   │   │   └── charts/           # Chart utilities & zoom hook
│   │   ├── workers/
│   │   │   └── sim.worker.ts     # Web Worker simulation loop
│   │   ├── hooks/
│   │   │   └── useWorkerSimulation.ts  # React hook (Worker + WS)
│   │   └── types/
│   │       └── simulation.ts     # Shared type definitions
│   ├── server/
│   │   └── localServer.ts        # Node.js WebSocket server
│   ├── Dockerfile                # Multi-target build
│   ├── nginx.conf                # Production nginx config
│   └── package.json
└── docker-compose.yml            # Container orchestration
```

## Quick Start

### Development (Browser-Only)

```bash
cd web/frontend
npm install
npm run dev
```

Open **http://localhost:8888**. Simulations run in a Web Worker — no server needed.

### With Local Server

For large simulations (10M+ iterations) or unlimited mode, run the Node.js server:

```bash
# Standard heap
npm run server

# 8 GB heap (recommended for large runs)
npm run server:8g
```

Enable **"Local Mode"** in the controls panel. The frontend connects via WebSocket on port 3001.

### Docker

```bash
cd web

# Browser-only (nginx serves static SPA)
docker compose up

# With simulation server
docker compose --profile server up

# Development with hot reload
docker compose --profile dev up
```

## Execution Modes

| Mode | How It Works | Best For |
|------|--------------|----------|
| **Web Worker** (default) | Solver runs in a browser worker thread | Quick experiments, no setup |
| **Local Server** | Node.js server streams results over WebSocket | Large simulations, unlimited mode |

Both modes use the same solver engine (`src/core/solver.ts`) and the same delta-based streaming protocol.

## WebSocket Protocol

Communication uses **delta-based streaming** — each update contains only new data since the last message.

### Message Flow

```
Client                          Server
  │                               │
  │──── start (SimConfig) ───────>│
  │                               │
  │<──── update (delta chunk) ────│  (repeated every chunk)
  │<──── update (delta chunk) ────│
  │         ...                   │
  │<──── finalising ──────────────│
  │<──── done (summary only) ─────│
  │                               │
  │──── stop ────────────────────>│  (optional: cancel early)
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `start` | Client → Server | Begin simulation with config |
| `stop` | Client → Server | Cancel running simulation |
| `update` | Server → Client | Delta chunk: new gaps, strategies, best-response actions |
| `finalising` | Server → Client | Computing final summary statistics |
| `done` | Server → Client | Lightweight completion message (summary only) |
| `error` | Server → Client | Error occurred |

### Update Payload (Delta)

```json
{
  "type": "update",
  "iteration": 5000,
  "deltaIterations": [4901, 4902, ...],
  "deltaAllGaps": [[0.0523, 0.0481, ...], ...],
  "deltaAvgGaps": [0.0501, ...],
  "deltaRowStrategies": [[[0.33, 0.33, 0.34]], ...],
  "deltaColStrategies": [[[0.33, 0.33, 0.34]], ...],
  "matrices": null,
  "avgGap": 0.0501
}
```

The client accumulates deltas into full arrays — no redundant retransmission.

## Game Modes

| Mode | Description |
|------|-------------|
| **Random** | Skew-symmetric $n \times n$ matrix with entries from $U(-1, 1)$ |
| **Mixed** | Batch of random games with different sizes (e.g. 3, 5, 7) |
| **Custom** | User-defined payoff matrix via the built-in editor |
| **Wang (2025)** | 9×9 lower-bound construction with prescribed $U_0$ initialisation |

## Solver Options

| Option | Values | Description |
|--------|--------|-------------|
| **Tie-breaking** | `lexicographic`, `random`, `anti-lexicographic` | How to break ties among equally-good best responses |
| **Initialisation** | `standard`, `random`, `wang` | How starting counts are set |
| **Unlimited** | on/off | Run until manually stopped (local mode only) |

## Technology Stack

- **React 18** + **TypeScript** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Styling
- **Recharts** — Charting library
- **Framer Motion** — Animations
- **react-resizable-panels** — Resizable layout
- **ws** — WebSocket server (Node.js)
- **tsx** — TypeScript execution for the server

## Development

### Type-Check

```bash
npx tsc --noEmit
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```
