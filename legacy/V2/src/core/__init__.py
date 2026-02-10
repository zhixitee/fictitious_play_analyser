"""Core algorithms for Fictitious Play simulation."""

from .solver import FPSolver
from .games import GameFactory

__all__ = ['FPSolver', 'GameFactory']
