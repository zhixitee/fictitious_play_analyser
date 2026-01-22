# Fictitious Play Convergence Analyzer

[![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production-success.svg)]()

A simulator for analyzing zero-sum game convergence using Fictitious Play algorithm with real-time visualization and analysis capabilities.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Features](#features)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Usage Examples](#usage-examples)
- [Docker](#docker)
- [Modular Components](#modular-components)
- [Theory & Background](#theory--background)
- [Code Quality](#code-quality)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Launch Applications

```bash
# GUI Application (Interactive Desktop App)
python gui_app.py

# CLI Application (Terminal Mode with Comprehensive Plots)
python cli_app.py --terminal --mode random --iter 10000 --batch 5

# Interactive Visualizer (Matplotlib with Click Selection)
python cli_app.py --mode mixed --sizes 3,5,7 --iter 5000

# Export Data (CSV or Markdown)
python cli_app.py --terminal --export results.csv --save-plots
```
![alt text](/img/image.png)
---

## Installation

### Requirements

- Python 3.8 or higher
- NumPy, Numba, Matplotlib, PyQt6, PyQtGraph, PyOpenGL

### Install Dependencies

```bash
pip install -r requirements.txt
```

**Dependencies:**
```
numpy>=1.23.5,<2.3.0
numba>=0.57.0
matplotlib>=3.7.0
PyQt6>=6.6.0
PyQtGraph>=0.13.3
PyOpenGL>=3.1.0
```

## Usage Examples

### 1. Using Modular Core Components

```python
# Import core algorithms (no GUI/CLI dependencies)
from src.core import FPSolver, GameFactory

# Generate a random 10x10 zero-sum game
matrix = GameFactory.get_random_game(10, 10, seed=42)

# Create solver and run 1000 iterations
solver = FPSolver(matrix)
iterations, gaps = solver.step(steps=1000)

# Analyze results
print(f"Final duality gap: {gaps[-1]:.6e}")
print(f"Karlin ratio: {gaps[-1] * np.sqrt(1000):.4f}")
```

### 2. Running Terminal Mode with Analysis

```bash
# Basic simulation
python cli_app.py --terminal --mode random --iter 10000 --batch 5

# Mixed sizes with export
python cli_app.py --terminal --mode mixed --sizes 3,5,7,10 \
    --iter 20000 --export results.csv --save-plots

# Custom parameters
python cli_app.py --terminal --mode random --iter 50000 \
    --batch 10 --chunk 200 --seed 12345
```

### 3. GUI Mode Features

```bash
# Launch GUI
python gui_app.py

# Features available in GUI:
# - Click on any game line to select and view weights
# - Right-click to deselect
# - Scroll to zoom in/out
# - Drag to pan view
# - Press 'r' to reset view
# - Iteration slider for time-travel analysis
# - Export current/all games to CSV/Markdown
```

### 4. Interactive Visualizer

```bash
# Launch with matplotlib visualizer
python cli_app.py --mode random --iter 5000 --batch 8

# Interactive features:
# - Click lines to view strategy weights
# - Real-time convergence tracking
# - Candlestick gap statistics
# - Hover for instant game info
```

---

## Docker

The project includes Docker support for containerized execution, ensuring consistent environments across different systems.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Docker Compose](https://docs.docker.com/compose/install/) (included with Docker Desktop)

### Building the Image

```bash
# Build using docker-compose
docker-compose build

# Or build directly with docker
docker build -t fp-analyzer .
```

### Running with Docker Compose

```bash
# Run CLI mode with default parameters
docker-compose run cli

# Run development shell
docker-compose --profile dev run dev
```

### Running with Docker

```bash
# Basic CLI simulation
docker run --rm convergence-cli python cli_app.py --terminal --mode random --iter 10000

# Mixed game sizes
docker run --rm convergence-cli python cli_app.py --terminal --mode mixed --sizes 3,5,7 --iter 20000

# Export results to host machine
docker run --rm -v "${PWD}/output:/app/output" convergence-cli \
    python cli_app.py --terminal --export output/results.csv
```

### CLI Parameters

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `--terminal` | Run in headless terminal mode | - | `--terminal` |
| `--mode` | Game generation mode: `random`, `mixed`, `custom` | `random` | `--mode mixed` |
| `--iter` | Total number of iterations | `10000` | `--iter 50000` |
| `--batch` | Number of games to simulate | `5` | `--batch 10` |
| `--sizes` | Game matrix sizes (for mixed mode) | `3,5,7,10` | `--sizes 3,5,7` |
| `--chunk` | Iterations per update chunk | `100` | `--chunk 200` |
| `--seed` | Random seed for reproducibility | Random | `--seed 12345` |
| `--export` | Export results to file (CSV/MD) | - | `--export results.csv` |
| `--save-plots` | Save plots to files | - | `--save-plots` |

### Docker Compose Services

| Service | Description | Usage |
|---------|-------------|-------|
| `cli` | Headless CLI simulation | `docker-compose run cli` |
| `gui` | GUI mode (requires X11) | `docker-compose --profile gui up gui` |
| `dev` | Development shell | `docker-compose --profile dev run dev` |

### Environment Variables

```bash
# Set display for GUI (Linux only)
export DISPLAY=:0

# Windows with VcXsrv
$env:DISPLAY="host.docker.internal:0"
```

### Volume Mounts

The default configuration mounts `./output` to `/app/output` in the container for persisting exported results:

```bash
# Results are saved to ./output on host
docker run --rm -v "${PWD}/output:/app/output" convergence-cli \
    python cli_app.py --terminal --export output/results.csv
```

### GUI on Windows

Running GUI applications from Docker on Windows requires an X server:

1. Install [VcXsrv](https://sourceforge.net/projects/vcxsrv/)
2. Launch XLaunch with "Disable access control" checked
3. Run:
```powershell
docker run --rm -e DISPLAY=host.docker.internal:0 convergence-cli python gui_app.py
```

> **Note:** For Windows users, running the GUI natively (`python gui_app.py`) is recommended for the best experience.

---