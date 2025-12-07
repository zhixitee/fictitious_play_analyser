import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.widgets import Button
from mpl_toolkits.mplot3d import Axes3D

class FPVisualizer:
    """
    Interactive real-time visualizer for Fictitious Play convergence.
    
    Features:
    - Displays all individual games with different colors (adjustable opacity)
    - Click on any game line to highlight it and view strategy weights
    - Right-click to deselect and return to overview mode
    - Scroll to zoom, drag to pan (like Desmos/Grafana)
    - Keyboard shortcuts for reset and help
    - Real-time updates during simulation
    - Convergence analysis with Karlin and Wang bounds
    - Interactive weight display panel with detailed console output
    """
    GRAFANA_STYLE = {
        'axes.facecolor': '#161719',
        'figure.facecolor': '#0b0c0e',
        'text.color': '#d8d9da',
        'axes.labelcolor': '#d8d9da',
        'xtick.color': '#9fa0a4',
        'ytick.color': '#9fa0a4',
        'grid.color': '#2e2e32',
        'lines.linewidth': 1.5,
        'keymap.quit': 'q'
    }
    
    # Color palette for individual games
    GAME_COLORS = [
        '#33b5e5', '#ff9830', '#73bf69', '#f2495c', '#b388ff',
        '#ffd54f', '#4dd0e1', '#ff6e40', '#aed581', '#ec407a'
    ]

    def __init__(self, title="Fictitious Play Real-Time", batch_size=1, solvers=None):
        plt.rcParams.update(self.GRAFANA_STYLE)
        
        # Enable interactive mode for real-time updates
        plt.ion() 
        self.fig = plt.figure(figsize=(20, 12))
        self.fig.canvas.manager.set_window_title(f"FP Dashboard - {title}")
        
        # Layout: Top Left (Gap 2D), Top Right (Gap 3D), Bottom (Alpha, Ratio, Weights)
        gs = self.fig.add_gridspec(2, 3, height_ratios=[1.2, 1], width_ratios=[1.2, 1.2, 0.8])
        self.ax_gap = self.fig.add_subplot(gs[0, 0])
        self.ax_gap_3d = self.fig.add_subplot(gs[0, 1], projection='3d')
        self.ax_alpha = self.fig.add_subplot(gs[1, 0])
        self.ax_ratio = self.fig.add_subplot(gs[1, 1])
        self.ax_weights = self.fig.add_subplot(gs[1, 2])
        
        self.title = title
        self.batch_size = batch_size
        self.solvers = solvers  # Store reference to solvers for weight display
        self.iterations = []
        self.avg_gaps = []
        self.all_gaps = None
        
        # Track individual game lines
        self.individual_lines = []
        self.selected_game_idx = None  # Which game is currently selected
        
        # Candlestick tracking
        self.candle_lines = []
        self.candle_boxes = []
        self.candle_interval = 100  # Show candlestick every 100 iterations
        
        self._setup_ax_gap()
        self._setup_ax_gap_3d()
        self._setup_ax_alpha()
        self._setup_ax_ratio()
        self._setup_ax_weights()
        
        # Pan/Zoom state
        self.pan_data = {'pressed': False, 'xpress': None, 'ypress': None, 'axes': None}
        self.EPS_PLOT = 1e-12
        
        # Connect interactive events
        self.fig.canvas.mpl_connect('button_press_event', self._on_mouse_press)
        self.fig.canvas.mpl_connect('button_release_event', self._on_mouse_release)
        self.fig.canvas.mpl_connect('motion_notify_event', self._on_mouse_move)
        self.fig.canvas.mpl_connect('scroll_event', self._on_scroll)
        self.fig.canvas.mpl_connect('key_press_event', self._on_key)
        
        # Hover annotations
        self.hover_annot = self.ax_gap.annotate("", xy=(0,0), xytext=(15,15), textcoords="offset points",
                                                bbox=dict(boxstyle="round,pad=0.5", fc='#1f1f20', 
                                                         ec='#2e2e32', alpha=0.95),
                                                arrowprops=dict(arrowstyle="->", color='#9fa0a4'),
                                                fontsize=9, color='#d8d9da', visible=False)
        
        print("\n=== INTERACTIVE CONTROLS ===")
        print("  Click on any game line to select and view weights")
        print("  Right-click to deselect")
        print("  Scroll to zoom in/out")
        print("  Left-click and drag to pan")
        print("  Press 'r' to reset view")
        print("  Press 'h' for help\n")
        
        self.fig.tight_layout()

    def _setup_ax_gap(self):
        self.ax_gap.set_title(f"Duality Gap Convergence ({self.title}) - Click to select game", fontweight='bold')
        self.ax_gap.set_ylabel("Duality Gap (Log Scale)")
        self.ax_gap.set_yscale('log')
        self.ax_gap.set_xscale('log')
        self.ax_gap.grid(True, alpha=0.3)
        
        # Create individual game lines with anti-aliasing
        for i in range(self.batch_size):
            color = self.GAME_COLORS[i % len(self.GAME_COLORS)]
            line, = self.ax_gap.plot([], [], color=color, lw=1.5, alpha=1.0, 
                                     label=f"Game {i+1}" if self.batch_size <= 10 else None,
                                     picker=5,  # Enable picking with 5pt tolerance
                                     antialiased=True,  # Smooth line rendering
                                     solid_capstyle='round',  # Smooth line caps
                                     solid_joinstyle='round')  # Smooth line joins
            self.individual_lines.append(line)
        
        # Plot Elements with smooth rendering
        self.line_avg, = self.ax_gap.plot([], [], color='#fade2a', lw=2.5, label="Average Gap", 
                                          zorder=100, antialiased=True, 
                                          solid_capstyle='round', solid_joinstyle='round')
        self.line_karl, = self.ax_gap.plot([], [], '--', color='#73bf69', alpha=0.8, lw=1.5, 
                                           label="Karlin $O(t^{-1/2})$", zorder=99, antialiased=True)
        self.line_wang, = self.ax_gap.plot([], [], ':', color='#f2495c', alpha=0.8, lw=1.5, 
                                           label=r"Wang $\Omega(t^{-1/3})$", zorder=99, antialiased=True)
        
        # Create dummy markers for legend
        self.legend_max = self.ax_gap.scatter([], [], s=80, color='#f2495c', marker='v', 
                                              alpha=0.9, label='Max Gap (every 100)', edgecolors='white', linewidths=1)
        self.legend_median = self.ax_gap.scatter([], [], s=100, color='#fade2a', marker='o', 
                                                 alpha=0.9, label='Median Gap', edgecolors='white', linewidths=1.5)
        self.legend_min = self.ax_gap.scatter([], [], s=80, color='#73bf69', marker='^', 
                                              alpha=0.9, label='Min Gap', edgecolors='white', linewidths=1)
        
        # Only show legend if batch size is reasonable
        if self.batch_size <= 10:
            self.ax_gap.legend(loc='upper right', facecolor='#1f1f20', edgecolor='#2e2e32', 
                              ncol=2 if self.batch_size > 5 else 1, fontsize=9)
        else:
            self.ax_gap.legend([self.line_avg, self.line_karl, self.line_wang, 
                               self.legend_max, self.legend_median, self.legend_min], 
                              ["Average Gap", "Karlin $O(t^{-1/2})$", r"Wang $\Omega(t^{-1/3})$",
                               "Max Gap (100)", "Median Gap (100)", "Min Gap (100)"],
                              loc='upper right', facecolor='#1f1f20', edgecolor='#2e2e32', 
                              ncol=2, fontsize=8)

    def _setup_ax_alpha(self):
        self.ax_alpha.set_title(r"Convergence Rate Estimate ($\alpha$)", fontweight='bold')
        self.ax_alpha.set_xlabel("Iteration")
        self.ax_alpha.set_ylabel(r"Exponent $\alpha$ (Slope)")
        self.ax_alpha.set_xscale('log')
        self.ax_alpha.grid(True, alpha=0.3)
        
        # Set limits to focus on the interesting region [-1.0, 0.0]
        self.ax_alpha.set_ylim(-0.8, -0.2)
        
        self.line_alpha, = self.ax_alpha.plot([], [], color='#33b5e5', lw=2.0, alpha=0.9, 
                                              label="Windowed Slope", antialiased=True,
                                              solid_capstyle='round', solid_joinstyle='round')
        self.ax_alpha.axhline(-0.5, color='#73bf69', ls='--', alpha=0.6, label="-0.5 (Karlin)", lw=1.5)
        self.ax_alpha.axhline(-0.333, color='#f2495c', ls='--', alpha=0.6, label="-0.33 (Wang)", lw=1.5)
        self.ax_alpha.legend(loc='lower right', facecolor='#1f1f20')

    def _setup_ax_ratio(self):
        self.ax_ratio.set_title("Gap / Karlin Bound Ratio", fontweight='bold')
        self.ax_ratio.set_xlabel("Iteration")
        self.ax_ratio.set_ylabel("Ratio (Actual/Theory)")
        self.ax_ratio.set_xscale('log')
        self.ax_ratio.grid(True, alpha=0.3)
        
        # Reference line at 1.0 - if gap matches the initial Karlin bound exactly
        self.ax_ratio.axhline(1.0, color='#73bf69', ls='--', alpha=0.6, lw=1.5)
        
        # Ratio = Gap / (1/sqrt(t)) to find the constant C where Gap(t) ≈ C/sqrt(t)
        self.line_ratio, = self.ax_ratio.plot([], [], color='#ff9830', lw=2.5, 
                                              label=r"$Gap / (1/\sqrt{t})$",
                                              antialiased=True,
                                              solid_capstyle='round', solid_joinstyle='round')
        self.ax_ratio.legend(loc='upper left', facecolor='#1f1f20')
    
    def _setup_ax_gap_3d(self):
        """Setup the 3D duality gap plot."""
        self.ax_gap_3d.set_title("3D Duality Gap View", fontweight='bold', pad=15)
        self.ax_gap_3d.set_xlabel("Iteration (t)", fontweight='bold', labelpad=10)
        self.ax_gap_3d.set_ylabel("Game Index", fontweight='bold', labelpad=10)
        self.ax_gap_3d.set_zlabel("Duality Gap", fontweight='bold', labelpad=10)
        
        # Set background colors for dark theme
        self.ax_gap_3d.xaxis.pane.fill = False
        self.ax_gap_3d.yaxis.pane.fill = False
        self.ax_gap_3d.zaxis.pane.fill = False
        self.ax_gap_3d.grid(True, alpha=0.3)
        
        # Set equal aspect ratio for all axes
        self.ax_gap_3d.set_box_aspect([1, 1, 1])
        
        # Store 3D plot lines
        self.lines_3d = []
        
    def _setup_ax_weights(self):
        """Setup the weights display panel."""
        self.ax_weights.set_title("Strategy Weights (Click game to view)", fontweight='bold')
        self.ax_weights.axis('off')
        
        # Create text object for displaying weights
        self.weights_text = self.ax_weights.text(0.05, 0.95, "No game selected\n\nClick on a game line\nin the duality gap plot",
                                                 transform=self.ax_weights.transAxes,
                                                 verticalalignment='top',
                                                 fontfamily='monospace',
                                                 fontsize=9,
                                                 color='#d8d9da')

    def update(self, new_iterations, new_gaps):
        """Called every chunk to update the UI."""
        # 1. Update Data Storage
        if len(self.iterations) == 0:
            self.iterations = new_iterations
            # Handle shape (batch, steps) -> ensure consistent concatenation
            if new_gaps.ndim == 1: new_gaps = new_gaps.reshape(1, -1)
            self.all_gaps = new_gaps
        else:
            self.iterations = np.concatenate([self.iterations, new_iterations])
            if new_gaps.ndim == 1: new_gaps = new_gaps.reshape(1, -1)
            self.all_gaps = np.hstack([self.all_gaps, new_gaps])

        # Compute Average across batch
        self.avg_gaps = np.mean(self.all_gaps, axis=0)
        
        # Safe arrays for math (avoid log(0))
        t = self.iterations
        safe_t = np.maximum(t, 1)
        safe_gaps = np.maximum(self.avg_gaps, 1e-15)

        # -----------------------------
        # 1. Update Duality Gap Plot
        # -----------------------------
        # Update individual game lines
        for i in range(self.batch_size):
            if i < len(self.individual_lines):
                game_gaps = np.maximum(self.all_gaps[i, :], 1e-15)
                self.individual_lines[i].set_data(t, game_gaps)
        
        # Update average line
        self.line_avg.set_data(t, self.avg_gaps)
        
        # Scale reference lines to start at the same point as data
        if len(self.avg_gaps) > 0:
            start_gap = self.avg_gaps[0]
            start_t = safe_t[0]
            
            # Karlin: C / sqrt(t)
            c_karl = start_gap * np.sqrt(start_t)
            self.line_karl.set_data(t, c_karl / np.sqrt(safe_t))
            
            # Wang: C / cbrt(t)
            c_wang = start_gap * (start_t**(1/3))
            self.line_wang.set_data(t, c_wang * (safe_t**(-1/3)))
        
        # Update candlesticks every 100 iterations
        current_iter = len(self.iterations)
        if current_iter % self.candle_interval == 0 or current_iter == len(t):
            self._update_candlesticks()

        self.ax_gap.relim()
        self.ax_gap.autoscale_view()
        
        # -----------------------------
        # 4. Update 3D Plot
        # -----------------------------
        self._update_3d_plot()

        # -----------------------------
        # 2. Update Alpha (Slope) Plot
        # -----------------------------
        # We need enough history to compute a stable slope
        if len(t) > 200:
            # Window size grows with t to reduce jitter at late stages
            window = max(200, len(t) // 10) 
            
            # Compute log-log derivative
            log_t = np.log10(safe_t)
            log_g = np.log10(safe_gaps)
            
            # Vectorized slope: (y[i] - y[i-w]) / (x[i] - x[i-w])
            slope_est = (log_g[window:] - log_g[:-window]) / (log_t[window:] - log_t[:-window])
            t_slope = t[window:]
            
            self.line_alpha.set_data(t_slope, slope_est)
            self.ax_alpha.relim()
            self.ax_alpha.autoscale_view(scaley=False) # Keep Y-limits fixed

        # -----------------------------
        # 3. Update Ratio Plot
        # -----------------------------
        # Ratio = Gap / (1/sqrt(t)) to find the constant C where Gap(t) ≈ C/sqrt(t)
        # If converging at Karlin rate, this ratio should stabilize to constant C
        karlin_theoretical = 1.0 / np.sqrt(safe_t)
        ratio = self.avg_gaps / karlin_theoretical
        self.line_ratio.set_data(t, ratio)
        self.ax_ratio.relim()
        self.ax_ratio.autoscale_view()

        # Refresh UI
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()
    
    def _on_mouse_press(self, event):
        """Handle mouse press for pan and click selection."""
        if event.inaxes == self.ax_gap:
            if event.button == 3:  # Right click to deselect
                self._deselect_game()
                return
            
            # Check if user clicked on an individual game line
            for i, line in enumerate(self.individual_lines):
                contains, _ = line.contains(event)
                if contains:
                    self._select_game(i)
                    return
            
            # Start pan operation if left click
            if event.button == 1:
                self.pan_data['pressed'] = True
                self.pan_data['axes'] = event.inaxes
                self.pan_data['xpress'] = event.xdata
                self.pan_data['ypress'] = event.ydata
        
        # Pan for other axes
        if event.inaxes in [self.ax_alpha, self.ax_ratio] and event.button == 1:
            self.pan_data['pressed'] = True
            self.pan_data['axes'] = event.inaxes
            self.pan_data['xpress'] = event.xdata
            self.pan_data['ypress'] = event.ydata
    
    def _on_mouse_release(self, event):
        """Handle mouse release to end pan."""
        self.pan_data['pressed'] = False
        self.pan_data['axes'] = None
    
    def _on_mouse_move(self, event):
        """Handle mouse move for pan and hover."""
        # Pan handling
        if self.pan_data['pressed'] and event.inaxes == self.pan_data['axes']:
            if event.xdata is None or event.ydata is None:
                return
            
            ax = self.pan_data['axes']
            dx = event.xdata - self.pan_data['xpress']
            dy = event.ydata - self.pan_data['ypress']
            
            xlim = ax.get_xlim()
            ylim = ax.get_ylim()
            
            # Handle log scale panning
            if ax.get_xscale() == 'log':
                dx_log = np.log10(event.xdata) - np.log10(self.pan_data['xpress'])
                new_xlim = [10**(np.log10(xlim[0]) - dx_log), 10**(np.log10(xlim[1]) - dx_log)]
            else:
                new_xlim = [xlim[0] - dx, xlim[1] - dx]
            
            if ax.get_yscale() == 'log':
                dy_log = np.log10(max(event.ydata, self.EPS_PLOT)) - np.log10(max(self.pan_data['ypress'], self.EPS_PLOT))
                new_ylim = [10**(np.log10(ylim[0]) - dy_log), 10**(np.log10(ylim[1]) - dy_log)]
            else:
                new_ylim = [ylim[0] - dy, ylim[1] - dy]
            
            ax.set_xlim(new_xlim)
            ax.set_ylim(new_ylim)
            self.fig.canvas.draw_idle()
            return
        
        # Hover handling for gap plot
        if event.inaxes == self.ax_gap:
            for i, line in enumerate(self.individual_lines):
                contains, _ = line.contains(event)
                if contains and len(self.iterations) > 0:
                    current_gap = self.all_gaps[i, -1]
                    self.hover_annot.xy = (self.iterations[-1], current_gap)
                    self.hover_annot.set_text(f"Game {i+1}\\nGap: {current_gap:.6e}")
                    self.hover_annot.set_visible(True)
                    self.fig.canvas.draw_idle()
                    return
            self.hover_annot.set_visible(False)
            self.fig.canvas.draw_idle()
    
    def _on_scroll(self, event):
        """Handle scroll for zoom."""
        if event.inaxes not in [self.ax_gap, self.ax_alpha, self.ax_ratio]:
            return
        
        ax = event.inaxes
        if event.xdata is None or event.ydata is None:
            return
        
        zoom_factor = 1.2 if event.button == 'down' else 1 / 1.2
        
        xlim = ax.get_xlim()
        ylim = ax.get_ylim()
        
        # Zoom centered on mouse position
        if ax.get_xscale() == 'log':
            xdata_log = np.log10(event.xdata)
            xlim_log = np.log10(xlim)
            new_xlim_log = [
                xdata_log - (xdata_log - xlim_log[0]) * zoom_factor,
                xdata_log + (xlim_log[1] - xdata_log) * zoom_factor
            ]
            new_xlim = 10 ** np.array(new_xlim_log)
        else:
            new_xlim = [
                event.xdata - (event.xdata - xlim[0]) * zoom_factor,
                event.xdata + (xlim[1] - event.xdata) * zoom_factor
            ]
        
        if ax.get_yscale() == 'log':
            ydata_log = np.log10(max(event.ydata, self.EPS_PLOT))
            ylim_log = np.log10(ylim)
            new_ylim_log = [
                ydata_log - (ydata_log - ylim_log[0]) * zoom_factor,
                ydata_log + (ylim_log[1] - ydata_log) * zoom_factor
            ]
            new_ylim = 10 ** np.array(new_ylim_log)
        else:
            new_ylim = [
                event.ydata - (event.ydata - ylim[0]) * zoom_factor,
                event.ydata + (ylim[1] - event.ydata) * zoom_factor
            ]
        
        ax.set_xlim(new_xlim)
        ax.set_ylim(new_ylim)
        self.fig.canvas.draw_idle()
    
    def _on_key(self, event):
        """Handle keyboard shortcuts."""
        if event.key == 'r':  # Reset view
            if len(self.iterations) > 0:
                t = len(self.iterations)
                self.ax_gap.set_xlim(1, t * 1.05)
                gmax = np.max(self.all_gaps)
                gmin = np.min(self.all_gaps)
                if self.ax_gap.get_yscale() == 'log':
                    self.ax_gap.set_ylim(max(self.EPS_PLOT, gmin / 2), gmax * 2)
                else:
                    self.ax_gap.set_ylim(0, gmax * 1.1)
                self.fig.canvas.draw_idle()
                print("View reset to default.")
        elif event.key == 'h':  # Help
            print("\\n=== KEYBOARD SHORTCUTS ===")
            print("  r - Reset view to default")
            print("  h - Show this help")
            print("  Mouse scroll - Zoom in/out")
            print("  Left-click drag - Pan view")
            print("  Click line - Select game")
            print("  Right-click - Deselect game\\n")
    
    def _select_game(self, game_idx):
        """Highlight a specific game and show its weights."""
        self.selected_game_idx = game_idx
        
        # Update line opacities - dim all except selected
        for i, line in enumerate(self.individual_lines):
            if i == game_idx:
                line.set_alpha(1.0)
                line.set_linewidth(3.0)
                line.set_zorder(101)  # Bring to front
            else:
                line.set_alpha(0.3)
                line.set_linewidth(1.5)
                line.set_zorder(1)
        
        # Update weights display
        if self.solvers and game_idx < len(self.solvers):
            self._display_weights(game_idx)
        
        # Update title
        color = self.GAME_COLORS[game_idx % len(self.GAME_COLORS)]
        self.ax_gap.set_title(f"Duality Gap Convergence ({self.title}) - Game {game_idx+1} Selected", 
                             fontweight='bold', color=color)
        
        self.fig.canvas.draw_idle()
    
    def _deselect_game(self):
        """Reset all games to default opacity."""
        self.selected_game_idx = None
        
        # Reset all line opacities
        for line in self.individual_lines:
            line.set_alpha(1.0)
            line.set_linewidth(1.5)
            line.set_zorder(1)
        
        # Clear weights display
        self.weights_text.set_text("No game selected\n\nClick on a game line\nin the duality gap plot\n\nRight-click to deselect")
        
        # Reset title
        self.ax_gap.set_title(f"Duality Gap Convergence ({self.title}) - Click to select game", 
                             fontweight='bold', color='#d8d9da')
        
        self.fig.canvas.draw_idle()
    
    def _display_weights(self, game_idx):
        """Display the current strategy weights for a selected game."""
        solver = self.solvers[game_idx]
        
        # Compute current strategies
        t = solver.current_t
        row_strategy = solver.count_row / t
        col_strategy = solver.count_col / t
        
        # Format output with color coding
        color = self.GAME_COLORS[game_idx % len(self.GAME_COLORS)]
        text_lines = [f"=== Game {game_idx + 1} (t={t:,}) ===\n"]
        
        # Row Player Strategy
        text_lines.append("Row Player:")
        for i, weight in enumerate(row_strategy):
            bar = '█' * int(weight * 20)  # Visual bar
            text_lines.append(f"  Act {i}: {weight:6.4f} {bar}")
        
        text_lines.append("\nColumn Player:")
        for i, weight in enumerate(col_strategy):
            bar = '█' * int(weight * 20)
            text_lines.append(f"  Act {i}: {weight:6.4f} {bar}")
        
        # Add gap and convergence info
        if len(self.all_gaps) > 0:
            current_gap = self.all_gaps[game_idx, -1]
            karlins_ratio = current_gap * np.sqrt(t)
            text_lines.append(f"\nGap: {current_gap:.6e}")
            text_lines.append(f"Karlin Ratio: {karlins_ratio:.4f}")
            text_lines.append(f"Theory: {1/np.sqrt(t):.6e}")
        
        self.weights_text.set_text('\n'.join(text_lines))
        
        # Also print to console for detailed analysis
        print(f"\n{'='*60}")
        print(f"  GAME {game_idx + 1} DETAILS (Iteration {t:,})")
        print(f"{'='*60}")
        print(f"\n  Duality Gap: {current_gap:.8e}")
        print(f"  Karlin Ratio: {karlins_ratio:.6f}")
        print(f"\n  Row Player Strategy:")
        for i, weight in enumerate(row_strategy):
            bar = '#' * int(weight * 40)
            print(f"    Action {i}: {weight:8.6f}  [{bar}]")
        print(f"\n  Column Player Strategy:")
        for i, weight in enumerate(col_strategy):
            bar = '#' * int(weight * 40)
            print(f"    Action {i}: {weight:8.6f}  [{bar}]")
        print(f"\n{'='*60}\n")

    def _update_3d_plot(self):
        """Update the 3D plot with all games plus Karlin and Wang bounds."""
        # Clear previous 3D lines
        for line in self.lines_3d:
            line.remove()
        self.lines_3d.clear()
        
        if len(self.iterations) == 0:
            return
        
        t = self.iterations
        safe_t = np.maximum(t, 1)
        
        # Plot Karlin bound at game index 0
        start_gap = self.avg_gaps[0]
        start_t = safe_t[0]
        c_karl = start_gap * np.sqrt(start_t)
        karlin_bound = c_karl / np.sqrt(safe_t)
        
        game_idx_karl = np.zeros_like(t)  # Game index 0 for Karlin
        line = self.ax_gap_3d.plot(t, game_idx_karl, karlin_bound, 
                                     color='#73bf69', linewidth=2.5, alpha=0.9, 
                                     label="Karlin", linestyle='--')[0]
        self.lines_3d.append(line)
        
        # Plot Wang bound at game index 1
        c_wang = start_gap * (start_t**(1/3))
        wang_bound = c_wang * (safe_t**(-1/3))
        
        game_idx_wang = np.ones_like(t)  # Game index 1 for Wang
        line = self.ax_gap_3d.plot(t, game_idx_wang, wang_bound, 
                                     color='#f2495c', linewidth=2.5, alpha=0.9, 
                                     label="Wang", linestyle=':')[0]
        self.lines_3d.append(line)
        
        # Plot individual games starting from game index 2
        for i in range(self.batch_size):
            game_gaps = np.maximum(self.all_gaps[i, :], 1e-15)
            game_idx_array = np.full_like(t, i + 2)  # Games start at index 2
            
            color = self.GAME_COLORS[i % len(self.GAME_COLORS)]
            line = self.ax_gap_3d.plot(t, game_idx_array, game_gaps, 
                                        color=color, linewidth=1.5, alpha=0.8)[0]
            self.lines_3d.append(line)
        
        # Update axis limits and labels
        self.ax_gap_3d.set_xlim(t[0], t[-1])
        self.ax_gap_3d.set_ylim(0, self.batch_size + 2)
        
        # Set z-axis limits before applying log scale
        all_gaps_flat = self.all_gaps[:, :len(t)].flatten()
        all_gaps_positive = all_gaps_flat[all_gaps_flat > 0]
        if len(all_gaps_positive) > 0:
            z_min = max(np.min(all_gaps_positive) * 0.5, 1e-6)
            z_max = np.max(all_gaps_positive) * 2.0
            self.ax_gap_3d.set_zlim(z_min, z_max)
        
        # Set z-axis scale (log or linear based on main plot)
        if self.ax_gap.get_yscale() == 'log':
            self.ax_gap_3d.set_zscale('log')
        
        # Update y-axis ticks to show game labels
        yticks = [0, 1] + list(range(2, self.batch_size + 2))
        ylabels = ['Karlin', 'Wang'] + [f'G{i+1}' for i in range(self.batch_size)]
        self.ax_gap_3d.set_yticks(yticks)
        self.ax_gap_3d.set_yticklabels(ylabels, fontsize=8)
        
        # Set viewing angle for better perspective
        self.ax_gap_3d.view_init(elev=20, azim=45)
    
    def _update_candlesticks(self):
        """Draw candlesticks showing max, median, and min gaps at regular intervals."""
        # Remove old candlesticks
        for line in self.candle_lines:
            line.remove()
        for box in self.candle_boxes:
            box.remove()
        self.candle_lines.clear()
        self.candle_boxes.clear()
        
        if len(self.iterations) == 0:
            return
        
        # Get all candlestick positions (every 100 iterations)
        max_iter = len(self.iterations)
        candle_positions = list(range(self.candle_interval, max_iter + 1, self.candle_interval))
        if max_iter not in candle_positions and max_iter > 0:
            candle_positions.append(max_iter)
        
        for pos_idx in candle_positions:
            if pos_idx > len(self.iterations):
                continue
            
            # Get gaps at this iteration across all games
            gaps_at_iter = self.all_gaps[:, pos_idx - 1]
            
            # Calculate statistics
            max_gap = np.max(gaps_at_iter)
            median_gap = np.median(gaps_at_iter)
            min_gap = np.min(gaps_at_iter)
            
            iter_val = self.iterations[pos_idx - 1]
            
            # Width of candlestick
            width = self.candle_interval * 0.4
            
            # Draw whisker line (min to max) in dark gray
            whisker = self.ax_gap.plot([iter_val, iter_val], [min_gap, max_gap], 
                                       color='#6e6e6e', linewidth=2, alpha=0.7, zorder=50)
            self.candle_lines.extend(whisker)
            
            # Draw red marker for max (highest gap - worst performance)
            max_marker = self.ax_gap.scatter([iter_val], [max_gap], 
                                            s=80, color='#f2495c', marker='v', 
                                            alpha=0.9, zorder=52, edgecolors='white', linewidths=1)
            self.candle_boxes.append(max_marker)
            
            # Draw yellow marker for median
            median_marker = self.ax_gap.scatter([iter_val], [median_gap], 
                                               s=100, color='#fade2a', marker='o', 
                                               alpha=0.9, zorder=53, edgecolors='white', linewidths=1.5)
            self.candle_boxes.append(median_marker)
            
            # Draw green marker for min (lowest gap - best performance)
            min_marker = self.ax_gap.scatter([iter_val], [min_gap], 
                                            s=80, color='#73bf69', marker='^', 
                                            alpha=0.9, zorder=52, edgecolors='white', linewidths=1)
            self.candle_boxes.append(min_marker)

    def keep_open(self):
        plt.ioff()
        plt.show()