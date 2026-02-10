import argparse
import time
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from src.core.games import GameFactory
from src.core.solver import FPSolver
from legacy.visualizer import FPVisualizer

def run_terminal_simulation(args):
    """
    Terminal-based simulation with comprehensive plotting and analysis.
    Implements all gui.py functionality without the GUI.
    """
    print("\n" + "="*80)
    print("FICTITIOUS PLAY CONVERGENCE ANALYZER - TERMINAL MODE")
    print("="*80)
    
    # Generate random seed if not specified
    if args.seed is None:
        args.seed = np.random.randint(0, 99999)
    
    # 1. Setup Game Matrices
    solvers = []
    game_matrices = []
    
    if args.mode == 'custom':
        # Custom matrix mode
        print(f"\nMode: Custom Matrix")
        print(f"Note: Custom matrix must be provided. Using default 2x2 zero-sum game.")
        custom_matrix = np.array([[0.0, -1.0], [1.0, 0.0]])
        solvers.append(FPSolver(custom_matrix))
        game_matrices.append(custom_matrix)
        title = "Custom Matrix (2x2)"
        
    elif args.mode == 'mixed':
        # Mixed sizes mode
        sizes = [int(s.strip()) for s in args.sizes.split(',')]
        print(f"\nMode: Mixed Sizes")
        print(f"Game Sizes: {sizes}")
        print(f"Batch Size: {args.batch}")
        
        rng = np.random.default_rng(args.seed)
        size_idx = 0
        for i in range(args.batch):
            size = sizes[size_idx % len(sizes)]
            mat = GameFactory.get_random_game(size, size, seed=args.seed + i)
            solvers.append(FPSolver(mat))
            game_matrices.append(mat)
            size_idx += 1
        
        title = f"Mixed Sizes {args.sizes} ({args.batch} games)"
        
    else:
        # Random games mode
        print(f"\nMode: Random Games")
        print(f"Batch Size: {args.batch}")
        
        for i in range(args.batch):
            mat = GameFactory.get_random_game(10, 10, seed=args.seed + i)
            solvers.append(FPSolver(mat))
            game_matrices.append(mat)
        
        title = f"Random 10x10 (Batch {args.batch})"
    
    print(f"\nSimulation Parameters:")
    print(f"  Total Iterations: {args.iter:,}")
    print(f"  Chunk Size: {args.chunk}")
    print(f"  Random Seed: {args.seed}")
    print(f"  Games Created: {len(solvers)}")
    
    # 2. Run Simulation with History Tracking
    print(f"\n{'='*80}")
    print("RUNNING SIMULATION...")
    print(f"{'='*80}\n")
    
    iterations = []
    all_gaps = [[] for _ in range(len(solvers))]
    all_row_counts = [[] for _ in range(len(solvers))]
    all_col_counts = [[] for _ in range(len(solvers))]
    
    total_steps = 0
    start_time = time.time()
    
    try:
        while total_steps < args.iter:
            batch_gaps = []
            current_iters = None
            
            # Run one chunk for all solvers with history tracking
            for i, solver in enumerate(solvers):
                iters, gaps, row_counts_history, col_counts_history = solver.step_with_history(steps=args.chunk)
                batch_gaps.append(gaps)
                if current_iters is None:
                    current_iters = iters
                
                # Store historical data
                all_row_counts[i].extend(row_counts_history)
                all_col_counts[i].extend(col_counts_history)
            
            # Store iteration and gap data
            iterations.extend(current_iters.tolist())
            for i, gaps in enumerate(batch_gaps):
                all_gaps[i].extend(gaps.tolist())
            
            total_steps += args.chunk
            
            # Print progress every 10 chunks
            if (total_steps / args.chunk) % 10 == 0 or total_steps >= args.iter:
                gaps_at_iter = [all_gaps[i][-1] for i in range(len(solvers))]
                avg_gap = np.mean(gaps_at_iter)
                elapsed = time.time() - start_time
                progress = (total_steps / args.iter) * 100
                print(f"Progress: {progress:5.1f}% | Iter: {total_steps:8,} | Avg Gap: {avg_gap:.6e} | Time: {elapsed:.1f}s")
    
    except KeyboardInterrupt:
        print("\n\nSimulation stopped by user.")
        if total_steps == 0:
            print("No data to analyze. Exiting.")
            return
    
    elapsed_time = time.time() - start_time
    
    # 3. Calculate Comprehensive Statistics
    print(f"\n{'='*80}")
    print("SIMULATION COMPLETE")
    print(f"{'='*80}")
    
    iterations = np.array(iterations)
    all_gaps = np.array(all_gaps)
    
    final_gaps = all_gaps[:, -1]
    final_iter = len(iterations)
    avg_gaps = np.mean(all_gaps, axis=0)
    
    # Karlin ratios
    karlins_ratios = final_gaps * np.sqrt(final_iter)
    theoretical_karlin = 1.0 / np.sqrt(final_iter)
    
    # Gap statistics
    print(f"\nTotal Iterations: {final_iter:,}")
    print(f"Elapsed Time: {elapsed_time:.2f}s")
    print(f"Iterations/Second: {final_iter/elapsed_time:.1f}")
    
    print(f"\nFinal Duality Gap Statistics:")
    print(f"  Mean:     {np.mean(final_gaps):.6e}")
    print(f"  Median:   {np.median(final_gaps):.6e}")
    print(f"  Min:      {np.min(final_gaps):.6e}")
    print(f"  Max:      {np.max(final_gaps):.6e}")
    print(f"  Std Dev:  {np.std(final_gaps):.6e}")
    
    print(f"\nKarlin Ratio (Gap × √t) Statistics:")
    print(f"  Mean:     {np.mean(karlins_ratios):.4f}")
    print(f"  Median:   {np.median(karlins_ratios):.4f}")
    print(f"  Min:      {np.min(karlins_ratios):.4f}")
    print(f"  Max:      {np.max(karlins_ratios):.4f}")
    print(f"  Std Dev:  {np.std(karlins_ratios):.4f}")
    
    print(f"\nTheoretical Bounds:")
    print(f"  Karlin Bound:       {theoretical_karlin:.6e}")
    print(f"  Wang Bound:         {1/(final_iter**(1/3)):.6e}")
    print(f"  Avg/Karlin Ratio:   {np.mean(final_gaps)/theoretical_karlin:.4f}")
    
    # Convergence rate estimation (alpha)
    if final_iter > 200:
        window = max(200, final_iter // 10)
        safe_t = np.maximum(iterations, 1)
        safe_gaps = np.maximum(avg_gaps, 1e-15)
        
        log_t = np.log10(safe_t)
        log_g = np.log10(safe_gaps)
        
        # Calculate slope at the end
        if final_iter >= window:
            log_t_start = log_t[-window]
            log_t_end = log_t[-1]
            log_gap_start = log_g[-window]
            log_gap_end = log_g[-1]
            
            final_alpha = (log_gap_end - log_gap_start) / (log_t_end - log_t_start)
            
            print(f"\nConvergence Rate Analysis:")
            print(f"  Estimated α:        {final_alpha:.4f}")
            print(f"  Karlin Reference:   -0.5000")
            print(f"  Wang Reference:     -0.3333")
    
    # Per-game statistics
    if len(solvers) <= 20:
        print(f"\n{'='*80}")
        print("PER-GAME STATISTICS")
        print(f"{'='*80}")
        
        for i in range(len(solvers)):
            matrix = game_matrices[i]
            final_gap = final_gaps[i]
            karlin_ratio = karlins_ratios[i]
            
            print(f"\nGame {i+1}:")
            print(f"  Matrix Size:      {matrix.shape[0]}×{matrix.shape[1]}")
            print(f"  Final Gap:        {final_gap:.6e}")
            print(f"  Karlin Ratio:     {karlin_ratio:.4f}")
            print(f"  Gap/Karlin Bound: {final_gap/theoretical_karlin:.4f}")
    
    # 4. Strategy Analysis for First Game
    if len(solvers) > 0 and args.show_strategies:
        print(f"\n{'='*80}")
        print(f"STRATEGY ANALYSIS - GAME 1")
        print(f"{'='*80}")
        
        t = final_iter
        row_counts = all_row_counts[0][-1]
        col_counts = all_col_counts[0][-1]
        
        row_strategy = row_counts / t
        col_strategy = col_counts / t
        
        print(f"\nRow Player Strategy (Iteration {t:,}):")
        for i, weight in enumerate(row_strategy):
            bar = '█' * int(weight * 40)
            print(f"  Action {i:2d}: {weight:8.6f}  [{bar}]")
        
        print(f"\nColumn Player Strategy (Iteration {t:,}):")
        for i, weight in enumerate(col_strategy):
            bar = '█' * int(weight * 40)
            print(f"  Action {i:2d}: {weight:8.6f}  [{bar}]")
    
    # 5. Generate Comprehensive Plots
    if not args.no_plot:
        print(f"\n{'='*80}")
        print("GENERATING PLOTS...")
        print(f"{'='*80}\n")
        
        generate_comprehensive_plots(
            iterations, all_gaps, game_matrices, 
            all_row_counts, all_col_counts, 
            title, args.save_plots
        )
    
    # 6. Export Data if Requested
    if args.export:
        export_data(iterations, all_gaps, all_row_counts, all_col_counts, 
                   game_matrices, args.export, args.seed)
    
    print(f"\n{'='*80}")
    print("ANALYSIS COMPLETE")
    print(f"{'='*80}\n")


def generate_comprehensive_plots(iterations, all_gaps, game_matrices, 
                                all_row_counts, all_col_counts, 
                                title, save_plots=False):
    """
    Generate all plots from gui.py:
    1. Duality Gap Convergence (with individual games, average, bounds)
    2. Convergence Rate (α)
    3. Gap/Karlin Ratio
    4. 3D Convergence View
    5. Strategy Weights (for first game)
    """
    # Setup dark theme matching gui.py
    plt.style.use('dark_background')
    
    # Create figure with subplots
    fig = plt.figure(figsize=(20, 12))
    gs = GridSpec(3, 3, figure=fig, hspace=0.3, wspace=0.3)
    
    # Color palette from gui.py
    COLORS = [
        '#33b5e5', '#ff9830', '#73bf69', '#f2495c', '#b388ff',
        '#ffd54f', '#4dd0e1', '#ff6e40', '#aed581', '#ec407a'
    ]
    
    t = np.array(iterations)
    safe_t = np.maximum(t, 1)
    all_gaps_array = np.array(all_gaps)
    avg_gaps = np.mean(all_gaps_array, axis=0)
    safe_gaps = np.maximum(avg_gaps, 1e-15)
    
    # 1. Duality Gap Convergence
    ax1 = fig.add_subplot(gs[0, :2])
    ax1.set_title(f"{title} - Duality Gap Convergence", fontsize=14, fontweight='bold')
    ax1.set_xlabel("Iteration")
    ax1.set_ylabel("Duality Gap")
    ax1.set_xscale('log')
    ax1.set_yscale('log')
    ax1.grid(True, alpha=0.3)
    
    # Plot individual games
    for i in range(len(all_gaps)):
        color = COLORS[i % len(COLORS)]
        game_gaps = np.maximum(all_gaps_array[i, :], 1e-15)
        label = f"Game {i+1}" if len(all_gaps) <= 10 else None
        ax1.plot(t, game_gaps, color=color, linewidth=1.5, alpha=0.6, label=label)
    
    # Plot average
    ax1.plot(t, avg_gaps, color='#fade2a', linewidth=3, label='Average Gap', zorder=100)
    
    # Plot bounds
    start_gap = avg_gaps[0]
    start_t = safe_t[0]
    
    # Karlin bound
    c_karl = start_gap * np.sqrt(start_t)
    karlin_bound = c_karl / np.sqrt(safe_t)
    ax1.plot(t, karlin_bound, '--', color='#73bf69', linewidth=2, alpha=0.8, label='Karlin O(t⁻¹/²)')
    
    # Wang bound
    c_wang = start_gap * (start_t**(1/3))
    wang_bound = c_wang * (safe_t**(-1/3))
    ax1.plot(t, wang_bound, ':', color='#f2495c', linewidth=2, alpha=0.8, label='Wang Ω(t⁻¹/³)')
    
    if len(all_gaps) <= 10:
        ax1.legend(loc='upper right', fontsize=9)
    else:
        ax1.legend(['Average', 'Karlin', 'Wang'], loc='upper right', fontsize=9)
    
    # 2. Convergence Rate (α)
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.set_title("Convergence Rate (α)", fontsize=12, fontweight='bold')
    ax2.set_xlabel("Iteration")
    ax2.set_ylabel("Exponent α (Slope)")
    ax2.set_xscale('log')
    ax2.grid(True, alpha=0.3)
    ax2.set_ylim(-0.8, -0.2)
    
    if len(t) > 200:
        window = max(200, len(t) // 10)
        log_t = np.log10(safe_t)
        log_g = np.log10(safe_gaps)
        
        slope_est = (log_g[window:] - log_g[:-window]) / (log_t[window:] - log_t[:-window])
        t_slope = t[window:]
        
        ax2.plot(t_slope, slope_est, color='#33b5e5', linewidth=2, label='Windowed Slope')
        ax2.axhline(-0.5, color='#73bf69', linestyle='--', alpha=0.6, label='-0.5 (Karlin)')
        ax2.axhline(-0.333, color='#f2495c', linestyle='--', alpha=0.6, label='-0.33 (Wang)')
        ax2.legend(loc='lower right', fontsize=8)
    
    # 3. Gap/Karlin Ratio
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.set_title("Gap / Karlin Bound Ratio", fontsize=12, fontweight='bold')
    ax3.set_xlabel("Iteration")
    ax3.set_ylabel("Ratio (Actual/Theory)")
    ax3.set_xscale('log')
    ax3.grid(True, alpha=0.3)
    
    karlin_theoretical = 1.0 / np.sqrt(safe_t)
    ratio = avg_gaps / karlin_theoretical
    ax3.plot(t, ratio, color='#ff9830', linewidth=2.5, label='Gap / (1/√t)')
    ax3.legend(loc='upper left', fontsize=8)
    
    # 4. 3D Convergence View
    ax4 = fig.add_subplot(gs[0, 2], projection='3d')
    ax4.set_title("3D Convergence View", fontsize=12, fontweight='bold')
    ax4.set_xlabel("Iteration", fontweight='bold')
    ax4.set_ylabel("Game Index", fontweight='bold')
    ax4.set_zlabel("Duality Gap", fontweight='bold')
    
    # Normalize iterations for visualization
    t_normalized = 10 * (t - t[0]) / (t[-1] - t[0]) if len(t) > 1 else t
    
    # Use log scale for gaps
    log_gaps = np.log10(safe_gaps)
    gap_min = np.min(log_gaps)
    gap_max = np.max(log_gaps)
    gap_range = gap_max - gap_min if gap_max > gap_min else 1
    
    # Plot Karlin bound at y=0
    log_karlin = np.log10(np.maximum(karlin_bound, 1e-15))
    karlin_normalized = 5 * (log_karlin - gap_min) / gap_range
    karlin_y = np.zeros(len(t))
    ax4.plot(t_normalized, karlin_y, karlin_normalized, color='#73bf69', linewidth=2.5, alpha=0.9)
    
    # Plot Wang bound at y=1
    log_wang = np.log10(np.maximum(wang_bound, 1e-15))
    wang_normalized = 5 * (log_wang - gap_min) / gap_range
    wang_y = np.ones(len(t))
    ax4.plot(t_normalized, wang_y, wang_normalized, color='#f2495c', linewidth=2.5, alpha=0.9)
    
    # Plot individual games
    for i in range(len(all_gaps)):
        log_game_gaps = np.log10(np.maximum(all_gaps_array[i, :], 1e-15))
        game_normalized = 5 * (log_game_gaps - gap_min) / gap_range
        game_y = np.full(len(t), 2 + i)
        
        color = COLORS[i % len(COLORS)]
        color_rgb = tuple(int(color[j:j+2], 16)/255 for j in (1, 3, 5))
        ax4.plot(t_normalized, game_y, game_normalized, color=color_rgb, linewidth=1.5, alpha=0.8)
    
    ax4.view_init(elev=20, azim=45)
    
    # 5. Strategy Distribution (First Game)
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_title("Strategy Distribution (Game 1)", fontsize=12, fontweight='bold')
    ax5.axis('off')
    
    if len(all_row_counts) > 0 and len(all_row_counts[0]) > 0:
        final_t = len(iterations)
        row_counts = all_row_counts[0][-1]
        col_counts = all_col_counts[0][-1]
        
        row_strategy = row_counts / final_t
        col_strategy = col_counts / final_t
        
        text_lines = [f"Iteration {final_t:,}\n"]
        text_lines.append("Row Player:")
        for i, weight in enumerate(row_strategy[:10]):  # Show first 10
            bar = '█' * int(weight * 20)
            text_lines.append(f"Act {i}: {weight:.4f} {bar}")
        
        if len(row_strategy) > 10:
            text_lines.append(f"... ({len(row_strategy)-10} more)")
        
        text_lines.append("\nColumn Player:")
        for i, weight in enumerate(col_strategy[:10]):  # Show first 10
            bar = '█' * int(weight * 20)
            text_lines.append(f"Act {i}: {weight:.4f} {bar}")
        
        if len(col_strategy) > 10:
            text_lines.append(f"... ({len(col_strategy)-10} more)")
        
        ax5.text(0.05, 0.95, '\n'.join(text_lines), 
                transform=ax5.transAxes, verticalalignment='top',
                fontfamily='monospace', fontsize=8)
    
    # 6. Payoff Matrix (First Game)
    ax6 = fig.add_subplot(gs[2, 0])
    ax6.set_title("Payoff Matrix (Game 1)", fontsize=12, fontweight='bold')
    
    if len(game_matrices) > 0:
        matrix = game_matrices[0]
        n, m = matrix.shape
        
        # Show full matrix if small, otherwise show corner
        if n <= 10 and m <= 10:
            im = ax6.imshow(matrix, cmap='RdBu_r', aspect='auto')
            ax6.set_xticks(range(m))
            ax6.set_yticks(range(n))
            ax6.set_xticklabels([f'C{j}' for j in range(m)], fontsize=8)
            ax6.set_yticklabels([f'R{i}' for i in range(n)], fontsize=8)
            
            # Add colorbar
            plt.colorbar(im, ax=ax6, fraction=0.046, pad=0.04)
            
            # Add text annotations for values
            for i in range(n):
                for j in range(m):
                    text = ax6.text(j, i, f'{matrix[i, j]:.2f}',
                                   ha="center", va="center", color="white", fontsize=7)
        else:
            # Show 10x10 corner
            corner = matrix[:10, :10]
            im = ax6.imshow(corner, cmap='RdBu_r', aspect='auto')
            ax6.set_title(f"Payoff Matrix (Game 1) - Top-left 10×10 of {n}×{m}", fontsize=10)
            plt.colorbar(im, ax=ax6, fraction=0.046, pad=0.04)
    else:
        ax6.text(0.5, 0.5, "No matrix data", ha='center', va='center', transform=ax6.transAxes)
    
    # 7. Gap Statistics Over Time
    ax7 = fig.add_subplot(gs[2, 1:])
    ax7.set_title("Gap Statistics Evolution", fontsize=12, fontweight='bold')
    ax7.set_xlabel("Iteration")
    ax7.set_ylabel("Gap Statistics")
    ax7.set_xscale('log')
    ax7.set_yscale('log')
    ax7.grid(True, alpha=0.3)
    
    # Calculate statistics over time
    max_gaps = np.max(all_gaps_array, axis=0)
    min_gaps = np.min(all_gaps_array, axis=0)
    median_gaps = np.median(all_gaps_array, axis=0)
    
    ax7.plot(t, max_gaps, color='#f2495c', linewidth=2, label='Max', alpha=0.8)
    ax7.plot(t, avg_gaps, color='#fade2a', linewidth=2.5, label='Mean', alpha=0.9)
    ax7.plot(t, median_gaps, color='#ff9830', linewidth=2, label='Median', alpha=0.8)
    ax7.plot(t, min_gaps, color='#73bf69', linewidth=2, label='Min', alpha=0.8)
    ax7.fill_between(t, min_gaps, max_gaps, color='#808080', alpha=0.2, label='Range')
    ax7.legend(loc='upper right', fontsize=9)
    
    plt.suptitle(f"Fictitious Play Convergence Analysis - {title}", 
                fontsize=16, fontweight='bold', y=0.995)
    
    if save_plots:
        filename = f"fp_analysis_{int(time.time())}.png"
        plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='#0b0c0e')
        print(f"Plot saved to: {filename}")
    
    plt.show()


def export_data(iterations, all_gaps, all_row_counts, all_col_counts, 
               game_matrices, filepath, seed):
    """Export simulation data to file (CSV or Markdown format)."""
    import csv
    
    file_ext = filepath.split('.')[-1].lower()
    
    if file_ext == 'csv':
        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['# Fictitious Play Simulation Data'])
            writer.writerow([f'# Seed: {seed}'])
            writer.writerow([f'# Total Iterations: {len(iterations)}'])
            writer.writerow([f'# Number of Games: {len(all_gaps)}'])
            writer.writerow([])
            writer.writerow(['Game', 'Iteration', 'Gap', 'Row Strategy', 'Column Strategy'])
            
            for game_idx in range(len(all_gaps)):
                for iter_idx, t in enumerate(iterations):
                    gap = all_gaps[game_idx][iter_idx]
                    
                    if iter_idx < len(all_row_counts[game_idx]):
                        row_counts = all_row_counts[game_idx][iter_idx]
                        col_counts = all_col_counts[game_idx][iter_idx]
                        row_strategy = row_counts / t
                        col_strategy = col_counts / t
                        
                        row_str = ';'.join([f"{x:.6f}" for x in row_strategy])
                        col_str = ';'.join([f"{x:.6f}" for x in col_strategy])
                    else:
                        row_str = ''
                        col_str = ''
                    
                    writer.writerow([game_idx + 1, t, f"{gap:.6e}", row_str, col_str])
        
        print(f"Data exported to: {filepath}")
    
    elif file_ext == 'md':
        with open(filepath, 'w') as f:
            f.write(f"# Fictitious Play Simulation Data\n\n")
            f.write(f"**Seed:** {seed}\n\n")
            f.write(f"**Total Iterations:** {len(iterations):,}\n\n")
            f.write(f"**Number of Games:** {len(all_gaps)}\n\n")
            
            for game_idx in range(len(all_gaps)):
                matrix = game_matrices[game_idx]
                f.write(f"## Game {game_idx + 1}\n\n")
                f.write(f"**Matrix Size:** {matrix.shape[0]}×{matrix.shape[1]}\n\n")
                f.write("| Iteration | Gap | Row Strategy (first 5) | Column Strategy (first 5) |\n")
                f.write("|-----------|-----|------------------------|---------------------------|\n")
                
                # Sample every 100 iterations for readability
                sample_rate = max(1, len(iterations) // 100)
                for iter_idx in range(0, len(iterations), sample_rate):
                    t = iterations[iter_idx]
                    gap = all_gaps[game_idx][iter_idx]
                    
                    if iter_idx < len(all_row_counts[game_idx]):
                        row_counts = all_row_counts[game_idx][iter_idx]
                        col_counts = all_col_counts[game_idx][iter_idx]
                        row_strategy = row_counts / t
                        col_strategy = col_counts / t
                        
                        row_str = ', '.join([f"{x:.4f}" for x in row_strategy[:5]])
                        col_str = ', '.join([f"{x:.4f}" for x in col_strategy[:5]])
                        if len(row_strategy) > 5:
                            row_str += "..."
                        if len(col_strategy) > 5:
                            col_str += "..."
                    else:
                        row_str = ''
                        col_str = ''
                    
                    f.write(f"| {t:,} | {gap:.6e} | {row_str} | {col_str} |\n")
                
                f.write("\n")
        
        print(f"Data exported to: {filepath}")
    
    else:
        print(f"Unsupported export format: {file_ext}")
        print("Supported formats: .csv, .md")


def main():
    parser = argparse.ArgumentParser(
        description="Fictitious Play Convergence Analyzer - Terminal & Visualizer Mode",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Terminal mode with comprehensive analysis
  python main.py --terminal --mode random --iter 10000 --batch 5
  
  # Visualizer mode (interactive matplotlib)
  python main.py --mode mixed --sizes 3,5,7,10 --iter 5000 --batch 8
  
  # Export data and save plots
  python main.py --terminal --mode random --iter 20000 --export results.csv --save-plots
        """
    )
    
    # Mode selection
    parser.add_argument('--terminal', action='store_true', 
                       help="Run in terminal mode with comprehensive analysis (no interactive visualizer)")
    
    # Game configuration
    parser.add_argument('--mode', type=str, default='random', 
                       choices=['random', 'mixed', 'custom'], 
                       help="Game generation mode")
    parser.add_argument('--iter', type=int, default=10000, 
                       help="Total iterations to run")
    parser.add_argument('--batch', type=int, default=5, 
                       help="Number of parallel games (batch size)")
    parser.add_argument('--chunk', type=int, default=100, 
                       help="Iterations per update chunk")
    parser.add_argument('--seed', type=int, default=None, 
                       help="Random seed (random if not specified)")
    parser.add_argument('--sizes', type=str, default='3,5,7,10', 
                       help="Matrix sizes for mixed mode (comma-separated)")
    
    # Terminal mode options
    parser.add_argument('--no-plot', action='store_true',
                       help="Skip plot generation in terminal mode")
    parser.add_argument('--save-plots', action='store_true',
                       help="Save plots to file instead of displaying")
    parser.add_argument('--show-strategies', action='store_true',
                       help="Show detailed strategy analysis")
    parser.add_argument('--export', type=str, default=None,
                       help="Export data to file (CSV or Markdown format)")
    
    args = parser.parse_args()
    
    # Decide which mode to run
    if args.terminal:
        run_terminal_simulation(args)
    else:
        # Run original visualizer mode
        run_visualizer_mode(args)


def run_visualizer_mode(args):
    """Original visualizer mode with interactive matplotlib."""
    # Generate random seed if not specified
    if args.seed is None:
        args.seed = np.random.randint(0, 99999)
    
    # Setup Game Matrices
    if args.mode == 'mixed':
        sizes = [int(s.strip()) for s in args.sizes.split(',')]
        solvers = []
        rng = np.random.default_rng(args.seed)
        
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
        
        while len(solvers) < args.batch:
            mat = GameFactory.get_random_game(sizes[-1], sizes[-1], seed=args.seed + len(solvers))
            solvers.append(FPSolver(mat))
        
        title = f"Mixed Sizes {args.sizes} ({args.batch} games)"
    else:
        solvers = []
        for i in range(args.batch):
            mat = GameFactory.get_random_game(10, 10, seed=args.seed + i)
            solvers.append(FPSolver(mat))
        title = f"Random 10x10 (Batch {args.batch})"

    # Setup Visualization
    viz = FPVisualizer(title=title, batch_size=args.batch, solvers=solvers)
    
    # Real-Time Loop
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
            
            for solver in solvers:
                iters, gaps = solver.step(steps=args.chunk)
                batch_gaps.append(gaps)
                current_iters = iters
            
            gaps_array = np.vstack(batch_gaps)
            viz.update(current_iters, gaps_array)
            
            total_steps += args.chunk
            
            if (total_steps / args.chunk) % 10 == 0:
                avg_gap = np.mean(gaps_array[:, -1])
                print(f"Iter {total_steps}: Gap = {avg_gap:.6e}")

    except KeyboardInterrupt:
        print("\nSimulation stopped by user.")

    # Print final statistics
    print("\n" + "="*70)
    print("SIMULATION COMPLETE")
    print("="*70)
    
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