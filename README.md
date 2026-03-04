# Fictitious Play Convergence Analyser

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/licence-MIT-green.svg)](LICENSE)

A browser-based simulator for studying the convergence behaviour of the **Fictitious Play** algorithm in two-player zero-sum games, with real-time visualisation, statistical analysis, and data export. Built as part of a final-year dissertation.

All computation runs entirely in the browser (via Web Workers) or optionally on a local Node.js server — no cloud backend required.

![Fictitious Play Convergence Analyser](/img/image.png)

---

## Table of Contents

- [What Is This?](#what-is-this)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Docker](#docker)
- [Theory & Background](#theory--background)
- [Legacy Python Versions](#legacy-python-versions)
- [Licence](#licence)

---

## What Is This?

**Fictitious Play** (Brown 1951) is an iterative algorithm for finding Nash equilibria in games. At each round, both players play a best response to the opponent's empirical mixed strategy. Robinson (1951) proved that in two-player zero-sum games the **duality gap** — the difference between each player's best-response payoff — converges to zero at rate $O(T^{-1/2})$.

This project provides an interactive tool to:

- **Simulate** Fictitious Play on random, custom, or structured zero-sum games
- **Visualise** duality gap convergence in real time on a zoomable log-scale chart
- **Inspect** strategy weight evolution and best-response action histories
- **Analyse** Karlin's ratio ($\text{gap} \times \sqrt{T}$) and other summary statistics
- **Export** results to CSV for further analysis
- **Reproduce** the $\Theta(T^{-1/3})$ lower bound from Wang (2025) via a built-in 9×9 construction

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Game modes** | Random (2×2 – 10×10), mixed sizes, custom matrix editor, Wang (2025) 9×9 |
| **Execution modes** | Browser Web Worker (default) or Local Node.js server with 8 GB heap |
| **Real-time charts** | Zoomable duality gap plot, best-response action chart, strategy weight panels |
| **Iteration explorer** | Scrub through iterations to inspect per-game strategy distributions |
| **Solver options** | Lexicographic / random / anti-lexicographic tie-breaking; standard / random / Wang initialisation |
| **Unlimited mode** | Run until manually stopped (local server mode only) |
| **Statistics** | Gap mean, median, min, max, std; Karlin's ratio; theoretical bound comparison |
| **Data export** | CSV download of full gap history and summary statistics |
| **Scalability** | Adaptive downsampling to 50k display points; handles 10M+ iterations without OOM |
| **Docker** | Multi-target Dockerfile with nginx (static) and Node.js (server) variants |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm

### Install and Run

```bash
cd web/frontend
npm install
npm run dev
```

Open **http://localhost:8888** in your browser. Everything runs locally in a Web Worker — no server needed.

### Using the Local Server (for large simulations)

The local Node.js server provides better performance and supports unlimited iterations:

```bash
# Standard (default heap)
npm run server

# With 8 GB heap (recommended for 10M+ iterations)
npm run server:8g
```

Then enable **"Local Mode"** in the controls panel. The frontend connects to the server over WebSocket on port 3001.

### Usage Guide

1. **Choose a game mode**: Random generates skew-symmetric matrices; Mixed runs multiple sizes; Custom lets you edit the payoff matrix; Wang (2025) loads the 9×9 lower-bound construction.
2. **Configure parameters**: Set iteration count, batch size, chunk size, tie-breaking rule, and initialisation mode.
3. **Start the simulation**: Click the play button. The duality gap chart updates in real time.
4. **Explore results**: Use the iteration slider and game selector in the right panel to inspect strategy weights at any point. Toggle individual game curves on the chart.
5. **Export data**: Click the export button to download gap history and summary statistics as CSV.

---

## Docker

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Run

```bash
# Browser-only (static SPA served by nginx)
docker compose -f web/docker-compose.yml up

# With local Node.js simulation server
docker compose -f web/docker-compose.yml --profile server up

# Development with hot reload
docker compose -f web/docker-compose.yml --profile dev up
```

| Service | Description | Port |
|---------|-------------|------|
| `frontend` | Production nginx (static SPA) | 80 |
| `local-server` | Node.js simulation server (profile: `server`) | 3001 |
| `frontend-dev` | Vite dev server with hot reload (profile: `dev`) | 8888 |

---

## Theory & Background

**Fictitious Play** was introduced by Brown (1951) as an iterative procedure for solving two-player games. At each step $t$:

1. Each player computes a **best response** to the opponent's empirical frequency of play
2. The empirical frequencies are updated to include the new actions
3. The **duality gap** — the difference between the row player's best-response payoff and the column player's best-response payoff — measures distance from equilibrium

**Robinson (1951)** proved that for zero-sum games, the duality gap converges to zero, establishing the rate $O(T^{-1/2})$.

**Karlin's ratio** ($\text{gap} \times \sqrt{T}$) normalises the gap by the theoretical rate. If the ratio converges to a finite constant, the game achieves the "typical" $\Theta(T^{-1/2})$ rate.

**Wang (2025)** constructed a 9×9 skew-symmetric game where, with a specific non-standard initialisation $U_0$, Fictitious Play converges at rate $\Theta(T^{-1/3})$ — proving the classical bound is not tight in general. This construction is built into the simulator as the **Wang (2025)** mode.

### Key References

- Brown, G. W. (1951). *Iterative solution of games by Fictitious Play*. Activity Analysis of Production and Allocation.
- Robinson, J. (1951). *An iterative method of solving a game*. Annals of Mathematics, 54(2), 296–301.
- Wang, Z. (2025). *On the convergence rate of fictitious play*. arXiv preprint.

---

## Legacy Python Versions

> The original Python desktop application and CLI tools are preserved in `legacy/` for reference. The current version of this project is the TypeScript web application above — these legacy tools are not required.

### Requirements

- Python 3.8+
- NumPy, Numba, Matplotlib, PyQt5, PyQtGraph, PyOpenGL

### Install

```bash
pip install -r requirements.txt
```

### Run

```bash
# GUI application (V2)
cd legacy/V2
python gui_app.py

# CLI with terminal output
cd legacy/V2
python cli_app.py --terminal --mode random --iter 10000 --batch 5

# Export results
python cli_app.py --terminal --export results.csv --save-plots
```

### CLI Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--terminal` | Run in headless terminal mode | — |
| `--mode` | Game mode: `random`, `mixed`, `custom` | `random` |
| `--iter` | Total iterations | `10000` |
| `--batch` | Number of games | `5` |
| `--sizes` | Matrix sizes (mixed mode) | `3,5,7,10` |
| `--chunk` | Iterations per update | `100` |
| `--seed` | Random seed | Random |
| `--export` | Export to CSV or Markdown | — |
| `--save-plots` | Save plots to files | — |

---

## Licence

[MIT](LICENSE)