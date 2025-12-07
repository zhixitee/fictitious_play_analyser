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