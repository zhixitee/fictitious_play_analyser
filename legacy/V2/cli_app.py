"""
CLI Application Entry Point

Terminal mode:
    python cli_app.py --terminal --mode random --iter 10000

Interactive visualizer:
    python cli_app.py --mode mixed --sizes 3,5,7 --iter 5000
"""
import sys

# Import from modular src structure
from legacy.main import main


if __name__ == "__main__":
    main()
