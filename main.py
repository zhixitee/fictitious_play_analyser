import argparse
import time
import numpy as np
from games import GameFactory
from solver import FPSolver
from visualizer import FPVisualizer

def main():
    parser = argparse.ArgumentParser(description="Fictitious Play Real-Time Simulation")
    parser.add_argument('--mode', type=str, default='wang', choices=['wang', 'random', 'mixed'], help="Game Type")
    parser.add_argument('--iter', type=int, default=10000, help="Total iterations")
    parser.add_argument('--batch', type=int, default=5, help="Parallel games (Batch size)")
    parser.add_argument('--chunk', type=int, default=100, help="Iterations per frame update")
    parser.add_argument('--seed', type=int, default=420, help="Random seed")
    parser.add_argument('--sizes', type=str, default='3,5,7,10', help="Matrix sizes for mixed mode (comma-separated)")
    
    args = parser.parse_args()

    # 1. Setup Game Matrix
    if args.mode == 'wang':
        # Wang 2025 with slight perturbations for each instance to show variation
        base_matrix = GameFactory.get_wang_2025()
        solvers = []
        rng = np.random.default_rng(args.seed)
        for i in range(args.batch):
            # Add small random perturbation (1% noise) to create unique trajectories
            if args.batch > 1:
                perturbation = rng.uniform(-0.01, 0.01, size=base_matrix.shape)
                perturbed_matrix = base_matrix + perturbation
            else:
                perturbed_matrix = base_matrix
            solvers.append(FPSolver(perturbed_matrix))
        title = f"Wang 2025 Matrix ({args.batch} instance{'s' if args.batch > 1 else ''})"
    elif args.mode == 'mixed':
        # Mixed sizes - different n x n matrices
        sizes = [int(s.strip()) for s in args.sizes.split(',')]
        solvers = []
        rng = np.random.default_rng(args.seed)
        
        # Distribute batch across different sizes
        games_per_size = max(1, args.batch // len(sizes))
        remaining = args.batch
        
        for size in sizes:
            num_games = min(games_per_size, remaining)
            for i in range(num_games):
                mat = GameFactory.get_random_game(size, size, seed=args.seed + len(solvers))
                solvers.append(FPSolver(mat))
            remaining -= num_games
            if remaining <= 0:
                break
        
        # If we need more games, add them with the last size
        while len(solvers) < args.batch:
            mat = GameFactory.get_random_game(sizes[-1], sizes[-1], seed=args.seed + len(solvers))
            solvers.append(FPSolver(mat))
        
        title = f"Mixed Sizes {args.sizes} ({args.batch} games)"
    else:
        # Random games (all same size)
        solvers = []
        for i in range(args.batch):
            mat = GameFactory.get_random_game(10, 10, seed=args.seed + i)
            solvers.append(FPSolver(mat))
        title = f"Random 10x10 (Batch {args.batch})"

    # 2. Setup Visualization
    viz = FPVisualizer(title=title, batch_size=args.batch, solvers=solvers)
    
    # 3. Real-Time Loop
    total_steps = 0
    print(f"Starting simulation: {args.iter} iterations in chunks of {args.chunk}...")
    print(f"Interactive Features:")
    print(f"  - Click on any game line to view its strategy weights")
    print(f"  - Right-click to deselect and return to overview")
    print(f"  - All {args.batch} game(s) shown with individual colors")
    
    try:
        while total_steps < args.iter:
            batch_gaps = []
            current_iters = None
            
            # Run one chunk for all solvers
            for solver in solvers:
                iters, gaps = solver.step(steps=args.chunk)
                batch_gaps.append(gaps)
                current_iters = iters # Same for all
            
            # Convert list of arrays to 2D array (batch, steps)
            # Transpose so shapes align if visualizer expects (steps, batch) or handle in viz
            # Here: batch_gaps is [ (steps,), (steps,) ... ] -> vstack -> (batch, steps)
            gaps_array = np.vstack(batch_gaps)
            
            # Update Visualizer
            viz.update(current_iters, gaps_array)
            
            total_steps += args.chunk
            
            # Optional: Print status every 10 chunks
            if (total_steps / args.chunk) % 10 == 0:
                avg_gap = np.mean(gaps_array[:, -1])
                print(f"Iter {total_steps}: Gap = {avg_gap:.6e}")

    except KeyboardInterrupt:
        print("\nSimulation stopped by user.")

    # Print final statistics
    print("\n" + "="*70)
    print("SIMULATION COMPLETE")
    print("="*70)
    
    # Calculate final Karlin ratios for each game
    final_gaps = gaps_array[:, -1]
    final_iter = total_steps
    karlins_ratios = final_gaps * np.sqrt(final_iter)
    
    print(f"\nTotal Iterations: {total_steps:,}")
    print(f"\nFinal Duality Gap Statistics:")
    print(f"  Average: {np.mean(final_gaps):.6e}")
    print(f"  Median:  {np.median(final_gaps):.6e}")
    print(f"  Min:     {np.min(final_gaps):.6e}")
    print(f"  Max:     {np.max(final_gaps):.6e}")
    print(f"  Std Dev: {np.std(final_gaps):.6e}")
    
    print(f"\nKarlin's Ratio (Gap × √t) Statistics:")
    print(f"  Average: {np.mean(karlins_ratios):.6f}")
    print(f"  Median:  {np.median(karlins_ratios):.6f}")
    print(f"  Min:     {np.min(karlins_ratios):.6f}")
    print(f"  Max:     {np.max(karlins_ratios):.6f}")
    print(f"  Std Dev: {np.std(karlins_ratios):.6f}")
    
    print(f"\nTheoretical Karlin Bound: {1/np.sqrt(final_iter):.6e}")
    print(f"Average Ratio to Theory: {np.mean(final_gaps) / (1/np.sqrt(final_iter)):.4f}")
    
    if args.mode == 'mixed':
        print(f"\nMatrix Sizes Used: {args.sizes}")
        print(f"Note: Different sized games may converge at different rates")
    
    print("="*70 + "\n")
    
    viz.keep_open()

if __name__ == "__main__":
    main()