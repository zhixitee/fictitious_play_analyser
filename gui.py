"""
PyQt6-based desktop GUI for Fictitious Play Convergence Analyzer.
Standalone application with modern UI/UX and real-time plotting.
"""
import sys
import numpy as np
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QSlider, QComboBox, QPushButton, QSpinBox, QProgressBar,
    QTextEdit, QGroupBox, QGridLayout, QSplitter, QTabWidget, QGraphicsOpacityEffect,
    QCheckBox, QFrame, QScrollArea, QTableWidget, QTableWidgetItem, QFileDialog, QMessageBox
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer, QPropertyAnimation, QEasingCurve, QPoint
from PyQt6.QtGui import QFont, QPalette, QColor
import pyqtgraph as pg
import pyqtgraph.opengl as gl
from games import GameFactory
from solver import FPSolver

# Enable antialiasing for better plot quality
pg.setConfigOptions(antialias=True)

class SimulationWorker(QThread):
    """Background thread for running simulation without blocking UI."""
    update_signal = pyqtSignal(dict)
    finished_signal = pyqtSignal(dict)
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.running = True
        self.solvers = []
        
    def run(self):
        """Execute simulation in background thread."""
        # Initialize solvers
        mode = self.config['mode']
        batch_size = self.config['batch']
        seed = self.config['seed']
        rng = np.random.default_rng(seed)
        
        if mode == 'wang':
            base_matrix = GameFactory.get_wang_2025()
            for i in range(batch_size):
                if batch_size > 1:
                    perturbation = rng.uniform(-0.01, 0.01, size=base_matrix.shape)
                    perturbed_matrix = base_matrix + perturbation
                else:
                    perturbed_matrix = base_matrix
                self.solvers.append(FPSolver(perturbed_matrix))
        elif mode == 'mixed':
            sizes = self.config['sizes']
            size_idx = 0
            for i in range(batch_size):
                # Cycle through sizes to fill batch_size
                size = sizes[size_idx % len(sizes)]
                mat = GameFactory.get_random_game(size, size, seed=seed + i)
                self.solvers.append(FPSolver(mat))
                size_idx += 1
        else:  # random
            for i in range(batch_size):
                mat = GameFactory.get_random_game(10, 10, seed=seed + i)
                self.solvers.append(FPSolver(mat))
        
        # Run simulation
        total_iter = self.config['iterations']
        chunk_size = self.config['chunk']
        current_iter = 0
        
        # Use actual number of solvers created (may differ from requested batch_size)
        actual_batch = len(self.solvers)
        all_gaps = [[] for _ in range(actual_batch)]
        iterations = []
        
        # Store historical strategy data (count vectors at EVERY iteration for smooth slider)
        all_row_counts = [[] for _ in range(actual_batch)]
        all_col_counts = [[] for _ in range(actual_batch)]
        
        # Store matrices for display
        matrices = [solver.matrix.copy() for solver in self.solvers]
        
        while self.running and current_iter < total_iter:
            # Run one chunk
            batch_gaps = []
            current_iters = None
            
            for i, solver in enumerate(self.solvers):
                iters, gaps, row_counts_history, col_counts_history = solver.step_with_history(steps=chunk_size)
                batch_gaps.append(gaps)
                if current_iters is None:
                    current_iters = iters
                
                # Store count vectors at EACH iteration in this chunk
                all_row_counts[i].extend(row_counts_history)
                all_col_counts[i].extend(col_counts_history)
            
            # Store data
            iterations.extend(current_iters.tolist())
            for i, gaps in enumerate(batch_gaps):
                all_gaps[i].extend(gaps.tolist())
            
            current_iter += chunk_size
            
            # Calculate statistics
            gaps_array = np.array(batch_gaps)
            avg_gap = float(np.mean(gaps_array[:, -1]))
            
            # Emit update with historical data
            self.update_signal.emit({
                'iteration': current_iter,
                'iterations': iterations.copy(),
                'all_gaps': [g.copy() for g in all_gaps],
                'row_counts': [counts.copy() for counts in all_row_counts],
                'col_counts': [counts.copy() for counts in all_col_counts],
                'matrices': matrices,
                'avg_gap': avg_gap,
                'progress': (current_iter / total_iter) * 100
            })
            
            # Small delay to allow GUI to process updates and render plots
            self.msleep(10)  # 10ms delay for smooth UI updates
        
        # Calculate final statistics
        final_gaps = np.array([g[-1] for g in all_gaps])
        karlins_ratios = final_gaps * np.sqrt(current_iter)
        
        self.finished_signal.emit({
            'total_iterations': current_iter,
            'gap_mean': float(np.mean(final_gaps)),
            'gap_median': float(np.median(final_gaps)),
            'gap_min': float(np.min(final_gaps)),
            'gap_max': float(np.max(final_gaps)),
            'gap_std': float(np.std(final_gaps)),
            'ratio_mean': float(np.mean(karlins_ratios)),
            'ratio_median': float(np.median(karlins_ratios)),
            'ratio_min': float(np.min(karlins_ratios)),
            'ratio_max': float(np.max(karlins_ratios)),
            'ratio_std': float(np.std(karlins_ratios)),
            'theoretical_bound': float(1 / np.sqrt(current_iter)),
            'ratio_to_theory': float(np.mean(final_gaps) / (1 / np.sqrt(current_iter)))
        })
    
    def stop(self):
        """Stop the simulation."""
        self.running = False

class FPAnalyzerGUI(QMainWindow):
    """Main application window."""
    
    COLORS = [
        (51, 181, 229), (255, 152, 48), (115, 191, 105), (242, 73, 92), (179, 136, 255),
        (255, 213, 79), (77, 208, 225), (255, 110, 64), (174, 213, 129), (236, 64, 122)
    ]
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Zero Sum Fictitious Play Convergence Analyzer")
        self.setGeometry(100, 100, 1600, 900)
        
        # Simulation state
        self.worker = None
        self.solvers = []
        self.iterations = []
        self.all_gaps = []
        self.all_row_counts = []  # Historical count vectors for accurate strategy reconstruction
        self.all_col_counts = []
        self.game_matrices = []  # Store payoff matrices for display
        self.selected_game = None
        self.log_scale = True
        
        # Pre-loaded iteration data cache
        self.strategy_cache = {}  # {(game_idx, iter_idx): (row_strategy, col_strategy)}
        self.is_loading_iterations = False
        self.loading_overlay = None
        self.loading_animation_timer = QTimer()
        self.loading_animation_timer.setInterval(50)  # 20 FPS
        self.loading_animation_frame = 0
        
        # Section order persistence for drag-and-drop reordering
        self.section_order = ["matrix", "row_player", "col_player", "metrics", "rates"]  # Default order
        self.dragging_section = None
        self.drag_start_pos = None
        self._is_dragging_rebuild = False
        
        # Animation state
        self.update_timer = QTimer()
        self.update_timer.setInterval(50)  # Smooth 20 FPS updates
        self.pending_update = None
        self.animation_progress = 0.0
        
        # Legend state
        self.legend_visible = True
        self.legend_widget = None
        
        # Tab state for re-rendering (like React useEffect)
        self.current_tab_index = 0
        self.last_rendered_data = {'iterations': None, 'gaps': None}
        self.tab_needs_refresh = {0: False, 1: False}
        
        # Setup UI
        self.setup_ui()
        self.apply_dark_theme()
        
        # Connect plot click event
        self.plot_widget.scene().sigMouseClicked.connect(self.on_plot_clicked)
        
    def setup_ui(self):
        """Initialize the user interface."""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QHBoxLayout()
        central_widget.setLayout(main_layout)
        
        # Main horizontal splitter for collapsible side panels
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        main_layout.addWidget(main_splitter)
        
        # Left panel - Controls
        left_panel = self.create_control_panel()
        main_splitter.addWidget(left_panel)
        
        # Center panel - Plots with tabs
        center_widget = QWidget()
        center_layout = QVBoxLayout()
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_widget.setLayout(center_layout)
        
        # Main gap plot at top
        self.plot_widget = pg.PlotWidget(title="Duality Gap Convergence - Click game line to select")
        self.plot_widget.setLabel('left', 'Duality Gap')
        self.plot_widget.setLabel('bottom', 'Iteration')
        self.plot_widget.setLogMode(x=True, y=True)
        self.plot_widget.showGrid(x=True, y=True, alpha=0.3)
        self.plot_widget.setBackground('#161719')
        
        # Add legend widget (will be populated during updates)
        self.plot_widget.addLegend(offset=(10, 10))
        self.plot_legend = self.plot_widget.plotItem.legend
        
        center_layout.addWidget(self.plot_widget, stretch=2)
        
        # Tab widget for bottom plots
        self.tab_widget = QTabWidget()
        self.tab_widget.setMaximumHeight(400)
        
        # Tab 1: Alpha & Ratio plots
        analysis_tab = QWidget()
        analysis_layout = QHBoxLayout()
        analysis_layout.setContentsMargins(0, 0, 0, 0)
        analysis_tab.setLayout(analysis_layout)
        
        # Alpha plot
        self.alpha_plot = pg.PlotWidget(title="Convergence Rate (α)")
        self.alpha_plot.setLabel('left', 'Exponent α')
        self.alpha_plot.setLabel('bottom', 'Iteration')
        self.alpha_plot.setLogMode(x=True, y=False)
        self.alpha_plot.showGrid(x=True, y=True, alpha=0.3)
        self.alpha_plot.setBackground('#161719')
        self.alpha_plot.setYRange(-0.8, -0.2)
        # Hide right and top axes to prevent black corner squares
        self.alpha_plot.showAxis('right', False)
        self.alpha_plot.showAxis('top', False)
        analysis_layout.addWidget(self.alpha_plot)
        
        # Ratio plot
        self.ratio_plot = pg.PlotWidget(title="Gap / Karlin Bound Ratio")
        self.ratio_plot.setLabel('left', 'Ratio (Actual/Theory)')
        self.ratio_plot.setLabel('bottom', 'Iteration')
        self.ratio_plot.setLogMode(x=True, y=False)
        self.ratio_plot.showGrid(x=True, y=True, alpha=0.3)
        self.ratio_plot.setBackground('#161719')
        # Hide right and top axes to prevent black corner squares
        self.ratio_plot.showAxis('right', False)
        self.ratio_plot.showAxis('top', False)
        analysis_layout.addWidget(self.ratio_plot)
        
        self.tab_widget.addTab(analysis_tab, "Analysis (α & Ratio)")
        
        # Tab 2: 3D plot
        plot_3d_tab = QWidget()
        plot_3d_layout = QVBoxLayout()
        plot_3d_layout.setContentsMargins(0, 0, 0, 0)
        plot_3d_tab.setLayout(plot_3d_layout)
        
        self.plot_3d = gl.GLViewWidget()
        self.plot_3d.setBackgroundColor('#161719')
        self.plot_3d.setCameraPosition(distance=40, elevation=20, azimuth=45)
        self.plot_3d_items = []
        
        # Create 3D loading overlay
        self.loading_3d_overlay = QFrame(self.plot_3d)
        self.loading_3d_overlay.setStyleSheet("""
            QFrame {
                background-color: rgba(22, 23, 25, 230);
                border: 2px solid #2e2e32;
                border-radius: 8px;
            }
        """)
        self.loading_3d_overlay.setFixedSize(200, 80)
        self.loading_3d_overlay.hide()
        
        loading_3d_layout = QVBoxLayout(self.loading_3d_overlay)
        loading_3d_layout.setContentsMargins(20, 15, 20, 15)
        
        self.loading_3d_spinner_label = QLabel("⠋")
        self.loading_3d_spinner_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_3d_spinner_label.setStyleSheet("""
            color: #e8e8e8;
            font-size: 32pt;
            font-weight: bold;
        """)
        loading_3d_layout.addWidget(self.loading_3d_spinner_label)
        
        self.loading_3d_text = QLabel("Rendering 3D Plot...")
        self.loading_3d_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_3d_text.setStyleSheet("color: #d8d9da; font-size: 10pt;")
        loading_3d_layout.addWidget(self.loading_3d_text)
        
        # Timer for 3D loading animation
        self.loading_3d_timer = QTimer()
        self.loading_3d_timer.timeout.connect(self._update_3d_loading_animation)
        self.loading_3d_frame = 0
        
        # Add axis labels for 3D plot
        # X-axis: Iterations, Y-axis: Game Index, Z-axis: Duality Gap
        plot_3d_layout.addWidget(self.plot_3d)
        
        self.tab_widget.addTab(plot_3d_tab, "3D Plot | X: Iterations (blue) | Y: Game Index (green) | Z: Duality Gap (red)")
        
        # Add tab change animation
        self.tab_widget.currentChanged.connect(self._animate_tab_change)
        
        center_layout.addWidget(self.tab_widget, stretch=1)
        
        main_splitter.addWidget(center_widget)
        
        # Right panel - Strategy weights
        right_panel = self.create_weights_panel()
        main_splitter.addWidget(right_panel)
        
        # Set initial sizes for the three sections (left:center:right = 1:3:1)
        main_splitter.setSizes([300, 900, 350])
        main_splitter.setCollapsible(0, True)  # Left panel collapsible
        main_splitter.setCollapsible(1, False)  # Center panel not collapsible
        main_splitter.setCollapsible(2, True)  # Right panel collapsible   
        
        # Plot items
        self.plot_items = {
            'avg': None,
            'karlin': None,
            'wang': None,
            'games': [],
            'candlesticks': []
        }
        self.game_curves = []  # Store curve references for click detection
        self.plot_3d_items = []  # Store 3D plot items
        self.plot_3d_axis = None  # Store 3D axis system
    
    def _toggle_legend(self, state):
        """Toggle legend visibility with animation."""
        self.legend_visible = (state == 2)  # Qt.Checked = 2
        
        if self.plot_legend:
            if self.legend_visible:
                self.plot_legend.show()
                # Animate appearance
                if hasattr(self.plot_legend, 'setOpacity'):
                    self.plot_legend.setOpacity(1.0)
            else:
                self.plot_legend.hide()
    
    def _on_mode_changed(self, index):
        """Show/hide mixed size configuration based on selected mode."""
        # Show mixed size config only when "Mixed Sizes" is selected (index 2)
        self.mixed_size_group.setVisible(index == 2)
    
    def _set_all_sizes(self, checked):
        """Select or deselect all game size checkboxes."""
        for checkbox in self.size_checkboxes.values():
            checkbox.setChecked(checked)
    
    def _on_game_select_changed(self, value):
        """Handle game selection change from spin box."""
        game_idx = value - 1  # Convert to 0-indexed
        if game_idx >= 0 and game_idx < len(self.all_gaps):
            self.selected_game = game_idx
            self._update_weights_display()
    
    def _on_iteration_select_changed(self, value):
        """Handle iteration slider change."""
        # Sync with spin box
        self.iter_select_spin.blockSignals(True)
        self.iter_select_spin.setValue(value)
        self.iter_select_spin.blockSignals(False)
        self._update_weights_display()
    
    def _on_iteration_spin_changed(self, value):
        """Handle iteration spin box change."""
        # Sync with slider if value is in range
        if value <= self.iter_select_slider.maximum():
            self.iter_select_slider.blockSignals(True)
            self.iter_select_slider.setValue(value)
            self.iter_select_slider.blockSignals(False)
        self._update_weights_display()
    
    def _create_section_header(self, title, section_id="", icon="", collapsible=False, content_widget=None):
        """Create a styled section header with optional collapse toggle and drag handle."""
        container = QWidget()
        layout = QHBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        container.setLayout(layout)
        
        # Store section ID for reordering
        container.section_id = section_id
        container.content_widget = content_widget
        
        # Drag handle (⠿ symbol)
        drag_handle = QLabel(" ⠿ ")
        drag_handle.setStyleSheet("""
            QLabel {
                background: #1f1f1f;
                color: #707070;
                padding: 6px 5px;
                font-weight: bold;
                font-size: 10pt;
                border-right: 1px solid #303030;
            }
            QLabel:hover {
                background: #2a2a2a;
                color: #909090;
                cursor: move;
            }
        """)
        drag_handle.setCursor(Qt.CursorShape.OpenHandCursor)
        drag_handle.mousePressEvent = lambda event: self._start_section_drag(container, event)
        layout.addWidget(drag_handle)
        
        header = QLabel(title)
        header.setStyleSheet("""
            QLabel {
                background: #252525;
                color: #b0b0b0;
                padding: 6px 10px;
                font-weight: bold;
                font-size: 9pt;
                border-left: 3px solid #505050;
            }
        """)
        layout.addWidget(header)
        
        if collapsible and content_widget:
            toggle_btn = QPushButton("−")
            toggle_btn.setFixedSize(25, 25)
            toggle_btn.setStyleSheet("""
                QPushButton {
                    background: #303030;
                    color: #b0b0b0;
                    border: none;
                    font-weight: bold;
                    font-size: 12pt;
                }
                QPushButton:hover {
                    background: #404040;
                }
            """)
            
            # Store button and widget references for master toggle
            toggle_btn.content_widget = content_widget
            toggle_btn.is_collapsed = False
            
            def toggle_visibility():
                is_visible = content_widget.isVisible()
                content_widget.setVisible(not is_visible)
                toggle_btn.setText("+" if is_visible else "−")
                toggle_btn.is_collapsed = is_visible
            
            toggle_btn.clicked.connect(toggle_visibility)
            layout.addWidget(toggle_btn)
            
            # Store toggle button reference
            if not hasattr(self, 'section_toggles'):
                self.section_toggles = []
            self.section_toggles.append(toggle_btn)
        
        return container
    
    def _start_section_drag(self, section_header, event):
        """Start dragging a section."""
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging_section = section_header
            self.drag_start_pos = event.pos()
            section_header.setStyleSheet("background: #353535; border: 2px solid #707070;")
            
            # Enable mouse tracking on container to capture all movements
            self.weights_container.setMouseTracking(True)
            self.weights_scroll.setMouseTracking(True)
    
    def _section_drag_move(self, event):
        """Handle section drag movement - continuously updates order during drag."""
        if self.dragging_section is None:
            return
        
        # Store current section ID before any changes
        drag_id = self.dragging_section.section_id
        
        # Get mouse position relative to container
        mouse_pos = self.weights_container.mapFromGlobal(event.globalPosition().toPoint())
        
        # Track if we found a valid target
        found_target = False
        
        # Find which section we're hovering over
        for i in range(self.weights_container_layout.count()):
            widget = self.weights_container_layout.itemAt(i).widget()
            if widget and hasattr(widget, 'section_id') and widget.section_id != drag_id:
                widget_rect = widget.geometry()
                if widget_rect.contains(mouse_pos):
                    target_id = widget.section_id
                    
                    if target_id in self.section_order and drag_id in self.section_order:
                        drag_idx = self.section_order.index(drag_id)
                        target_idx = self.section_order.index(target_id)
                        
                        # Only swap if they're different (prevents redundant swaps)
                        if drag_idx != target_idx:
                            self.section_order[drag_idx], self.section_order[target_idx] = self.section_order[target_idx], self.section_order[drag_idx]
                            
                            # Rebuild display with new order but maintain drag state
                            self._rebuild_sections_during_drag(drag_id)
                            found_target = True
                    break
        
        # Ensure dragging section remains highlighted even if not over a target
        if not found_target and hasattr(self, 'dragging_section') and self.dragging_section:
            self.dragging_section.setStyleSheet("background: #353535; border: 2px solid #707070;")
    
    def _rebuild_sections_during_drag(self, dragging_id):
        """Rebuild sections during drag without losing drag state."""
        # Store the ID being dragged
        dragging_section_id = dragging_id
        
        # Trigger update but flag it as during drag
        self._is_dragging_rebuild = True
        self._update_weights_display()
        
        # Re-enable mouse tracking on container widgets immediately
        self.weights_container.setMouseTracking(True)
        self.weights_scroll.setMouseTracking(True)
        
        # Re-find and re-apply drag styling to the section header
        for i in range(self.weights_container_layout.count()):
            widget = self.weights_container_layout.itemAt(i).widget()
            if widget and hasattr(widget, 'section_id') and widget.section_id == dragging_section_id:
                widget.setStyleSheet("background: #353535; border: 2px solid #707070;")
                self.dragging_section = widget
                
                # Ensure mouse tracking continues after rebuild
                widget.setMouseTracking(True)
                break
        
        # Process events to ensure layout and event handlers are fully updated
        QApplication.processEvents()
        
        self._is_dragging_rebuild = False
    
    def _end_section_drag(self, event):
        """End section dragging."""
        if self.dragging_section:
            self.dragging_section.setStyleSheet("")
            self.dragging_section = None
            self.drag_start_pos = None
    
    def _create_metric_row(self, label, value, value_color="#4fc3f7"):
        """Create a metric display row."""
        widget = QWidget()
        layout = QHBoxLayout()
        layout.setContentsMargins(5, 3, 5, 3)
        widget.setLayout(layout)
        
        label_widget = QLabel(label)
        label_widget.setStyleSheet("color: #808080; font-size: 8pt;")
        
        value_widget = QLabel(value)
        value_widget.setStyleSheet(f"color: {value_color}; font-weight: bold; font-size: 9pt; font-family: 'Consolas', monospace;")
        
        layout.addWidget(label_widget)
        layout.addStretch()
        layout.addWidget(value_widget)
        
        return widget
    
    def _create_strategy_bar(self, index, weight, max_actions=10):
        """Create a visual strategy weight bar."""
        widget = QWidget()
        layout = QHBoxLayout()
        layout.setContentsMargins(3, 1, 3, 1)
        layout.setSpacing(6)
        widget.setLayout(layout)
        
        # Action label
        label = QLabel(f"{index}")
        label.setFixedWidth(20)
        label.setStyleSheet("color: #707070; font-size: 8pt; font-family: 'Consolas', monospace;")
        layout.addWidget(label)
        
        # Progress bar
        bar = QProgressBar()
        bar.setRange(0, 1000)
        bar.setValue(int(weight * 1000))
        bar.setTextVisible(False)
        bar.setFixedHeight(12)
        bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #303030;
                background: #1a1a1a;
                text-align: center;
            }
            QProgressBar::chunk {
                background: #505050;
            }
        """)
        layout.addWidget(bar, stretch=1)
        
        # Value label
        value_label = QLabel(f"{weight:.4f}")
        value_label.setFixedWidth(50)
        value_label.setStyleSheet("color: #b0b0b0; font-size: 8pt; font-family: 'Consolas', monospace;")
        value_label.setAlignment(Qt.AlignmentFlag.AlignRight)
        layout.addWidget(value_label)
        
        return widget
    
    def _toggle_all_sections(self):
        """Toggle all collapsible sections in strategy weights panel."""
        if not hasattr(self, 'section_toggles') or not self.section_toggles:
            return
        
        # Check if any section is expanded
        any_expanded = any(not btn.is_collapsed for btn in self.section_toggles if hasattr(btn, 'is_collapsed'))
        
        # Collapse all if any are expanded, otherwise expand all
        target_state = not any_expanded
        
        for btn in self.section_toggles:
            if hasattr(btn, 'content_widget') and hasattr(btn, 'is_collapsed'):
                btn.content_widget.setVisible(target_state)
                btn.setText("−" if target_state else "+")
                btn.is_collapsed = not target_state
        
        self.master_toggle_btn.setText("Expand All" if not target_state else "Collapse All")
    
    def _update_weights_display(self):
        """Update the weights display for the selected game and iteration."""
        if not self.iterations or not self.all_gaps:
            return
        
        # Store current collapse states before clearing
        collapse_states = []
        if hasattr(self, 'section_toggles'):
            collapse_states = [(btn.is_collapsed if hasattr(btn, 'is_collapsed') else False) 
                              for btn in self.section_toggles]
        
        game_idx = self.game_select_spin.value() - 1
        iter_value = self.iter_select_spin.value()
        
        # Validate indices
        if game_idx < 0 or game_idx >= len(self.all_gaps):
            return
        if iter_value < 1 or iter_value > len(self.iterations):
            return
        
        # Map to actual iteration index (iter_value is 1-indexed)
        iter_idx = iter_value - 1
        
        # Get iteration number
        t = self.iterations[iter_idx]
        
        # Get gap at selected iteration
        current_gap = self.all_gaps[game_idx][iter_idx] if iter_idx < len(self.all_gaps[game_idx]) else 0.0
        karlins_ratio = current_gap * np.sqrt(t) if t > 0 else 0.0
        
        # Try to get pre-cached strategy data first for instant loading
        cache_key = (game_idx, iter_idx)
        if cache_key in self.strategy_cache:
            row_strategy, col_strategy = self.strategy_cache[cache_key]
        # Get strategies at this EXACT iteration from historical data
        elif (self.all_row_counts and self.all_col_counts and 
            game_idx < len(self.all_row_counts) and 
            iter_idx < len(self.all_row_counts[game_idx])):
            
            # Use stored count vectors from this exact iteration
            row_counts = self.all_row_counts[game_idx][iter_idx]
            col_counts = self.all_col_counts[game_idx][iter_idx]
            
            # Compute strategies at this iteration
            row_strategy = row_counts / t if t > 0 else row_counts
            col_strategy = col_counts / t if t > 0 else col_counts
        elif self.worker and self.worker.solvers and game_idx < len(self.worker.solvers):
            # Fallback to current solver state
            solver = self.worker.solvers[game_idx]
            row_strategy = solver.count_row / solver.current_t if solver.current_t > 0 else solver.count_row
            col_strategy = solver.count_col / solver.current_t if solver.current_t > 0 else solver.count_col
        else:
            self.weights_text.setPlainText("No data available for this selection")
            return
        
        # Get payoff matrix for this game
        payoff_matrix = self.game_matrices[game_idx] if game_idx < len(self.game_matrices) else None
        
        # Save current scroll position
        scroll_value = self.weights_scroll.verticalScrollBar().value()
        
        # Block slider signals during update to prevent multiple rapid calls
        self.iter_select_slider.blockSignals(True)
        self.iter_select_spin.blockSignals(True)
        
        # Hide container during rebuild to prevent visual glitches
        self.weights_container.setVisible(False)
        
        # Clear existing widgets
        while self.weights_container_layout.count():
            item = self.weights_container_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Reset section toggles list
        self.section_toggles = []
        
        # ═══════════════════════════════════════════════════════════
        # HEADER SECTION
        # ═══════════════════════════════════════════════════════════
        header = QLabel(f"Game {game_idx + 1} • Iteration {t:,}")
        header.setStyleSheet("""
            QLabel {
                background: #202020;
                color: #d0d0d0;
                padding: 10px;
                font-weight: bold;
                font-size: 10pt;
                border-bottom: 2px solid #404040;
            }
        """)
        header.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.weights_container_layout.addWidget(header)
        
        # Build all sections first, then add in custom order
        sections = {}
        
        # ═══════════════════════════════════════════════════════════
        # PAYOFF MATRIX SECTION
        # ═══════════════════════════════════════════════════════════
        if payoff_matrix is not None:
            n, m = payoff_matrix.shape
            
            # Create table - show full matrix without truncation or scrollbars
            table = QTableWidget(n, m)
            
            # Set headers for all rows and columns
            table.setHorizontalHeaderLabels([f"C{j}" for j in range(m)])
            table.setVerticalHeaderLabels([f"R{i}" for i in range(n)])
            
            # Style table - minimalistic theme
            table.setStyleSheet("""
                QTableWidget {
                    background-color: #1a1a1a;
                    gridline-color: #333;
                    border: 1px solid #404040;
                }
                QTableWidget::item {
                    padding: 3px;
                    color: #d0d0d0;
                    font-family: 'Consolas', monospace;
                    font-size: 8pt;
                }
                QHeaderView::section {
                    background-color: #252525;
                    color: #a0a0a0;
                    padding: 3px;
                    border: 1px solid #333;
                    font-size: 8pt;
                }
            """)
            
            # Populate table - full matrix
            for i in range(n):
                for j in range(m):
                    val = payoff_matrix[i, j]
                    item = QTableWidgetItem(f"{val:.2f}")
                    item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                    
                    # Minimal color scheme - subtle shading only
                    if val > 0:
                        item.setForeground(QColor("#d0d0d0"))
                    elif val < 0:
                        item.setForeground(QColor("#a0a0a0"))
                    else:
                        item.setForeground(QColor("#808080"))
                    
                    table.setItem(i, j, item)
            
            # Disable scrollbars completely
            table.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
            table.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
            
            # Resize to contents
            table.resizeColumnsToContents()
            table.resizeRowsToContents()
            
            # Calculate exact size needed to show all content
            total_width = table.verticalHeader().width() + 4
            for i in range(m):
                total_width += table.columnWidth(i)
            
            total_height = table.horizontalHeader().height() + 4
            for i in range(n):
                total_height += table.rowHeight(i)
            
            # Set fixed size to show everything
            table.setFixedSize(total_width, total_height)
            
            # Add collapsible header for matrix
            matrix_header = self._create_section_header(f"Payoff Matrix ({n}×{m})", section_id="matrix", collapsible=True, content_widget=table)
            sections["matrix"] = (matrix_header, table)
        
        # ═══════════════════════════════════════════════════════════
        # STRATEGIES SECTION
        # ═══════════════════════════════════════════════════════════
        
        # Row Player - create container for all bars
        row_container = QWidget()
        row_layout = QVBoxLayout()
        row_layout.setContentsMargins(0, 0, 0, 0)
        row_layout.setSpacing(0)
        row_container.setLayout(row_layout)
        
        # Display all row player actions
        for i in range(len(row_strategy)):
            bar = self._create_strategy_bar(i, row_strategy[i], len(row_strategy))
            row_layout.addWidget(bar)
        
        row_header = self._create_section_header("Row Player", section_id="row_player", collapsible=True, content_widget=row_container)
        sections["row_player"] = (row_header, row_container)
        
        # Column Player - create container for all bars
        col_container = QWidget()
        col_layout = QVBoxLayout()
        col_layout.setContentsMargins(0, 0, 0, 0)
        col_layout.setSpacing(0)
        col_container.setLayout(col_layout)
        
        # Display all column player actions
        for i in range(len(col_strategy)):
            bar = self._create_strategy_bar(i, col_strategy[i], len(col_strategy))
            col_layout.addWidget(bar)
        
        col_header = self._create_section_header("Column Player", section_id="col_player", collapsible=True, content_widget=col_container)
        sections["col_player"] = (col_header, col_container)
        
        # ═══════════════════════════════════════════════════════════
        # CONVERGENCE METRICS SECTION
        # ═══════════════════════════════════════════════════════════
        metrics_frame = QFrame()
        metrics_frame.setStyleSheet("""
            QFrame {
                background-color: #1a1a1a;
                border: 1px solid #303030;
                padding: 4px;
            }
        """)
        metrics_layout = QVBoxLayout()
        metrics_layout.setSpacing(1)
        metrics_frame.setLayout(metrics_layout)
        
        metrics_layout.addWidget(self._create_metric_row("Duality Gap:", f"{current_gap:.6e}", "#c0c0c0"))
        metrics_layout.addWidget(self._create_metric_row("Karlin Ratio:", f"{karlins_ratio:.4f}", "#c0c0c0"))
        metrics_layout.addWidget(self._create_metric_row("Theory Bound:", f"{1/np.sqrt(t):.6e}", "#c0c0c0"))
        
        # Add separator
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("background-color: #404040; margin: 3px 0;")
        metrics_layout.addWidget(sep)
        
        # Add ratio data (Gap / Karlin Bound)
        karlin_bound = 1.0 / np.sqrt(t)
        gap_karlin_ratio = current_gap / karlin_bound if karlin_bound > 0 else 0.0
        metrics_layout.addWidget(self._create_metric_row("Gap/Karlin Ratio:", f"{gap_karlin_ratio:.4f}", "#c0c0c0"))
        
        # Add Wang bound ratio
        wang_bound = 1.0 / (t**(1/3)) if t > 0 else 0.0
        gap_wang_ratio = current_gap / wang_bound if wang_bound > 0 else 0.0
        metrics_layout.addWidget(self._create_metric_row("Gap/Wang Ratio:", f"{gap_wang_ratio:.4f}", "#c0c0c0"))
        
        metrics_header = self._create_section_header("Convergence Metrics", section_id="metrics", collapsible=True, content_widget=metrics_frame)
        sections["metrics"] = (metrics_header, metrics_frame)
        
        # Calculate convergence rates
        if iter_idx >= 100:
            rates_frame = QFrame()
            rates_frame.setStyleSheet("""
                QFrame {
                    background-color: #1a1a1a;
                    border: 1px solid #303030;
                    padding: 4px;
                }
            """)
            rates_layout = QVBoxLayout()
            rates_layout.setSpacing(1)
            rates_frame.setLayout(rates_layout)
            
            window = min(100, iter_idx // 2)
            if window > 0 and iter_idx >= window:
                game_gaps = self.all_gaps[game_idx]
                log_t_start = np.log10(self.iterations[iter_idx - window])
                log_t_end = np.log10(t)
                log_gap_start = np.log10(max(game_gaps[iter_idx - window], 1e-15))
                log_gap_end = np.log10(max(current_gap, 1e-15))
                
                individual_alpha = (log_gap_end - log_gap_start) / (log_t_end - log_t_start)
                
                rates_layout.addWidget(self._create_metric_row("This Game (α):", f"{individual_alpha:.4f}", "#c0c0c0"))
            
            # Mean convergence rate across all games
            if len(self.all_gaps) > 1 and window > 0:
                mean_gaps_start = np.mean([self.all_gaps[i][iter_idx - window] for i in range(len(self.all_gaps)) if iter_idx - window < len(self.all_gaps[i])])
                mean_gaps_end = np.mean([self.all_gaps[i][iter_idx] for i in range(len(self.all_gaps)) if iter_idx < len(self.all_gaps[i])])
                
                log_mean_gap_start = np.log10(max(mean_gaps_start, 1e-15))
                log_mean_gap_end = np.log10(max(mean_gaps_end, 1e-15))
                
                mean_alpha = (log_mean_gap_end - log_mean_gap_start) / (log_t_end - log_t_start)
                
                rates_layout.addWidget(self._create_metric_row("Batch Mean (α):", f"{mean_alpha:.4f}", "#c0c0c0"))
            
            # Separator
            sep = QFrame()
            sep.setFrameShape(QFrame.Shape.HLine)
            sep.setStyleSheet("background-color: #444;")
            rates_layout.addWidget(sep)
            
            # Theoretical references
            ref_widget = QWidget()
            ref_layout = QHBoxLayout()
            ref_layout.setContentsMargins(5, 3, 5, 3)
            ref_widget.setLayout(ref_layout)
            
            karlin_ref = QLabel("Karlin: -0.5000")
            karlin_ref.setStyleSheet("color: #909090; font-size: 8pt; font-family: 'Consolas', monospace;")
            wang_ref = QLabel("Wang: -0.3333")
            wang_ref.setStyleSheet("color: #909090; font-size: 8pt; font-family: 'Consolas', monospace;")
            
            ref_layout.addWidget(karlin_ref)
            ref_layout.addStretch()
            ref_layout.addWidget(wang_ref)
            
            rates_layout.addWidget(ref_widget)
            
            rates_header = self._create_section_header("Convergence Rates", section_id="rates", collapsible=True, content_widget=rates_frame)
            sections["rates"] = (rates_header, rates_frame)
        
        # Add sections in custom order
        for section_id in self.section_order:
            if section_id in sections:
                header, content = sections[section_id]
                self.weights_container_layout.addWidget(header)
                self.weights_container_layout.addWidget(content)
        
        # Restore collapse states
        if collapse_states and len(collapse_states) == len(self.section_toggles):
            for i, (btn, is_collapsed) in enumerate(zip(self.section_toggles, collapse_states)):
                if is_collapsed and hasattr(btn, 'content_widget'):
                    btn.content_widget.setVisible(False)
                    btn.setText("+")
                    btn.is_collapsed = True
        
        self.weights_container_layout.addStretch()
        
        # Process all pending events and ensure layout is complete
        QApplication.processEvents()
        
        # Show container and restore scroll position after everything is ready
        self.weights_container.setVisible(True)
        QTimer.singleShot(0, lambda: self.weights_scroll.verticalScrollBar().setValue(scroll_value))
        
        # Re-enable slider signals after update is complete
        self.iter_select_slider.blockSignals(False)
        self.iter_select_spin.blockSignals(False)
        
    def create_control_panel(self):
        """Create the control panel with simulation parameters."""
        panel = QGroupBox("Simulation Controls")
        panel.setFixedWidth(300)
        layout = QVBoxLayout()
        
        # Create legend toggle early (will be added later)
        self.legend_toggle = QCheckBox("Show Legend")
        self.legend_toggle.setChecked(True)
        self.legend_toggle.stateChanged.connect(self._toggle_legend)
        self.legend_toggle.setStyleSheet("""
            QCheckBox {
                color: #d8d9da;
                font-weight: bold;
                padding: 5px;
            }
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border-radius: 4px;
                border: 2px solid #707070;
            }
            QCheckBox::indicator:checked {
                background-color: #707070;
            }
            QCheckBox::indicator:unchecked {
                background-color: #2e2e32;
            }
        """)
        
        # Mode selection
        mode_layout = QHBoxLayout()
        mode_layout.addWidget(QLabel("Mode:"))
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["Wang 2025", "Random Games", "Mixed Sizes"])
        self.mode_combo.setCurrentIndex(1)  # Set Random Games as default
        self.mode_combo.currentIndexChanged.connect(self._on_mode_changed)
        mode_layout.addWidget(self.mode_combo)
        layout.addLayout(mode_layout)
        
        # Mixed size configuration (initially hidden)
        self.mixed_size_group = QGroupBox("Game Sizes Configuration")
        self.mixed_size_group.setVisible(False)
        mixed_layout = QVBoxLayout()
        
        # Description label
        desc_label = QLabel("Select which game sizes to include:")
        desc_label.setStyleSheet("color: #d8d9da; font-size: 11px; padding: 5px;")
        mixed_layout.addWidget(desc_label)
        
        # Scrollable area for checkboxes
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setMaximumHeight(150)
        scroll_widget = QWidget()
        scroll_layout = QGridLayout()
        scroll_widget.setLayout(scroll_layout)
        
        # Create checkboxes for game sizes 2-20
        self.size_checkboxes = {}
        default_sizes = [3, 5, 7, 10]
        for i, size in enumerate(range(2, 21)):
            checkbox = QCheckBox(f"{size}x{size}")
            checkbox.setChecked(size in default_sizes)
            checkbox.setStyleSheet("""
                QCheckBox {
                    color: #d8d9da;
                    font-size: 11px;
                    padding: 2px;
                }
                QCheckBox::indicator {
                    width: 14px;
                    height: 14px;
                    border-radius: 3px;
                    border: 1px solid #707070;
                }
                QCheckBox::indicator:checked {
                    background-color: #707070;
                }
                QCheckBox::indicator:unchecked {
                    background-color: #2e2e32;
                }
            """)
            self.size_checkboxes[size] = checkbox
            # Arrange in 4 columns
            row = i // 4
            col = i % 4
            scroll_layout.addWidget(checkbox, row, col)
        
        scroll_area.setWidget(scroll_widget)
        mixed_layout.addWidget(scroll_area)
        
        # Select all / Deselect all buttons
        select_btn_layout = QHBoxLayout()
        select_all_btn = QPushButton("Select All")
        select_all_btn.clicked.connect(lambda: self._set_all_sizes(True))
        select_all_btn.setMaximumWidth(100)
        deselect_all_btn = QPushButton("Clear All")
        deselect_all_btn.clicked.connect(lambda: self._set_all_sizes(False))
        deselect_all_btn.setMaximumWidth(100)
        select_btn_layout.addWidget(select_all_btn)
        select_btn_layout.addWidget(deselect_all_btn)
        select_btn_layout.addStretch()
        mixed_layout.addLayout(select_btn_layout)
        
        self.mixed_size_group.setLayout(mixed_layout)
        layout.addWidget(self.mixed_size_group)
        
        # Batch size
        layout.addWidget(QLabel("Batch Size:"))
        batch_layout = QHBoxLayout()
        self.batch_slider = QSlider(Qt.Orientation.Horizontal)
        self.batch_slider.setMinimum(1)
        self.batch_slider.setMaximum(20)
        self.batch_slider.setValue(5)
        self.batch_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.batch_slider.setTickInterval(5)
        batch_layout.addWidget(self.batch_slider)
        self.batch_spin = QSpinBox()
        self.batch_spin.setMinimum(1)
        self.batch_spin.setMaximum(1000)
        self.batch_spin.setValue(5)
        self.batch_spin.setFixedWidth(80)
        batch_layout.addWidget(self.batch_spin)
        # Sync slider and spin box
        self.batch_slider.valueChanged.connect(lambda v: self.batch_spin.setValue(v) if v <= 20 else None)
        self.batch_spin.valueChanged.connect(lambda v: self.batch_slider.setValue(v) if v <= 20 else None)
        layout.addLayout(batch_layout)
        
        # Iterations
        layout.addWidget(QLabel("Iterations:"))
        iter_layout = QHBoxLayout()
        self.iter_slider = QSlider(Qt.Orientation.Horizontal)
        self.iter_slider.setMinimum(1000)
        self.iter_slider.setMaximum(100000)
        self.iter_slider.setValue(10000)
        self.iter_slider.setSingleStep(1000)
        iter_layout.addWidget(self.iter_slider)
        self.iter_spin = QSpinBox()
        self.iter_spin.setMinimum(1000)
        self.iter_spin.setMaximum(10000000)
        self.iter_spin.setValue(10000)
        self.iter_spin.setSingleStep(1000)
        self.iter_spin.setFixedWidth(80)
        iter_layout.addWidget(self.iter_spin)
        # Sync slider and spin box
        self.iter_slider.valueChanged.connect(lambda v: self.iter_spin.setValue(v))
        self.iter_spin.valueChanged.connect(lambda v: self.iter_slider.setValue(v) if v <= 100000 else None)
        layout.addLayout(iter_layout)
        
        # Chunk size
        layout.addWidget(QLabel("Chunk Size:"))
        chunk_layout = QHBoxLayout()
        self.chunk_slider = QSlider(Qt.Orientation.Horizontal)
        self.chunk_slider.setMinimum(1)
        self.chunk_slider.setMaximum(500)
        self.chunk_slider.setValue(100)
        self.chunk_slider.setSingleStep(10)
        chunk_layout.addWidget(self.chunk_slider)
        self.chunk_spin = QSpinBox()
        self.chunk_spin.setMinimum(1)
        self.chunk_spin.setMaximum(10000)
        self.chunk_spin.setValue(100)
        self.chunk_spin.setSingleStep(10)
        self.chunk_spin.setFixedWidth(80)
        chunk_layout.addWidget(self.chunk_spin)
        # Sync slider and spin box
        self.chunk_slider.valueChanged.connect(lambda v: self.chunk_spin.setValue(v))
        self.chunk_spin.valueChanged.connect(lambda v: self.chunk_slider.setValue(v) if v <= 500 else None)
        layout.addLayout(chunk_layout)
        
        # Seed
        seed_layout = QHBoxLayout()
        seed_layout.addWidget(QLabel("Seed:"))
        self.seed_spin = QSpinBox()
        self.seed_spin.setMinimum(0)
        self.seed_spin.setMaximum(99999)
        self.seed_spin.setValue(420)
        seed_layout.addWidget(self.seed_spin)
        layout.addLayout(seed_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        self.start_btn = QPushButton("Start")
        self.start_btn.clicked.connect(self.start_simulation)
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.clicked.connect(self.stop_simulation)
        self.stop_btn.setEnabled(False)
        button_layout.addWidget(self.start_btn)
        button_layout.addWidget(self.stop_btn)
        layout.addLayout(button_layout)
        
        # Log scale toggle
        self.log_toggle_btn = QPushButton("Log Scale: ON")
        self.log_toggle_btn.clicked.connect(self.toggle_log_scale)
        layout.addWidget(self.log_toggle_btn)
        
        # Legend toggle
        layout.addWidget(self.legend_toggle)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        layout.addWidget(self.progress_bar)
        
        # Status display - fills remaining space dynamically
        status_group = QGroupBox("Current Status")
        status_layout = QVBoxLayout()
        self.status_text = QTextEdit()
        self.status_text.setReadOnly(True)
        self.status_text.setFont(QFont("Courier", 9))
        # Remove maximum height to allow dynamic expansion
        status_layout.addWidget(self.status_text)
        status_group.setLayout(status_layout)
        layout.addWidget(status_group, stretch=1)  # Stretch factor 1 to fill remaining space
        panel.setLayout(layout)
        return panel
    
    def create_weights_panel(self):
        """Create the strategy weights display panel."""
        panel = QGroupBox("Strategy Weights")
        panel.setFixedWidth(450)
        layout = QVBoxLayout()
        
        # Game selector with export buttons
        game_select_layout = QHBoxLayout()
        game_select_layout.addWidget(QLabel("Game:"))
        self.game_select_spin = QSpinBox()
        self.game_select_spin.setMinimum(1)
        self.game_select_spin.setMaximum(1)
        self.game_select_spin.setValue(1)
        self.game_select_spin.setFixedWidth(70)
        self.game_select_spin.valueChanged.connect(self._on_game_select_changed)
        game_select_layout.addWidget(self.game_select_spin)
        game_select_layout.addStretch()
        
        # Export buttons
        self.export_current_btn = QPushButton("Export Current")
        self.export_current_btn.setFixedWidth(110)
        self.export_current_btn.setEnabled(False)
        self.export_current_btn.clicked.connect(self._export_current_game)
        self.export_current_btn.setStyleSheet("""
            QPushButton {
                background: #505050;
                color: #e8e8e8;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                font-size: 8pt;
            }
            QPushButton:hover {
                background: #656565;
            }
            QPushButton:disabled {
                background: #2e2e32;
                color: #6e6e6e;
            }
        """)
        game_select_layout.addWidget(self.export_current_btn)
        
        self.export_all_btn = QPushButton("Export All")
        self.export_all_btn.setFixedWidth(90)
        self.export_all_btn.setEnabled(False)
        self.export_all_btn.clicked.connect(self._export_all_games)
        self.export_all_btn.setStyleSheet("""
            QPushButton {
                background: #505050;
                color: #e8e8e8;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                font-size: 8pt;
            }
            QPushButton:hover {
                background: #656565;
            }
            QPushButton:disabled {
                background: #2e2e32;
                color: #6e6e6e;
            }
        """)
        game_select_layout.addWidget(self.export_all_btn)
        
        layout.addLayout(game_select_layout)
        
        # Iteration selector with slider and text input
        iter_label = QLabel("Iteration:")
        layout.addWidget(iter_label)
        
        iter_control_layout = QHBoxLayout()
        
        # Iteration slider
        self.iter_select_slider = QSlider(Qt.Orientation.Horizontal)
        self.iter_select_slider.setMinimum(1)
        self.iter_select_slider.setMaximum(1)
        self.iter_select_slider.setValue(1)
        self.iter_select_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.iter_select_slider.setTracking(True)  # Update in real-time while dragging
        self.iter_select_slider.valueChanged.connect(self._on_iteration_select_changed)
        iter_control_layout.addWidget(self.iter_select_slider)
        
        # Iteration text input
        self.iter_select_spin = QSpinBox()
        self.iter_select_spin.setMinimum(1)
        self.iter_select_spin.setMaximum(1)
        self.iter_select_spin.setValue(1)
        self.iter_select_spin.setFixedWidth(80)
        self.iter_select_spin.valueChanged.connect(self._on_iteration_spin_changed)
        iter_control_layout.addWidget(self.iter_select_spin)
        
        layout.addLayout(iter_control_layout)
        
        # Master collapse/expand toggle
        master_toggle_layout = QHBoxLayout()
        self.master_toggle_btn = QPushButton("Collapse All")
        self.master_toggle_btn.setStyleSheet("""
            QPushButton {
                background: #303030;
                color: #b0b0b0;
                border: 1px solid #404040;
                padding: 4px 8px;
                font-size: 8pt;
            }
            QPushButton:hover {
                background: #404040;
            }
        """)
        self.master_toggle_btn.clicked.connect(self._toggle_all_sections)
        master_toggle_layout.addStretch()
        master_toggle_layout.addWidget(self.master_toggle_btn)
        layout.addLayout(master_toggle_layout)
        
        # Scroll area for custom widgets
        self.weights_scroll = QScrollArea()
        self.weights_scroll.setWidgetResizable(True)
        self.weights_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.weights_scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        
        self.weights_container = QWidget()
        self.weights_container_layout = QVBoxLayout()
        self.weights_container_layout.setSpacing(12)
        self.weights_container_layout.setContentsMargins(5, 5, 5, 5)
        self.weights_container.setLayout(self.weights_container_layout)
        
        # Placeholder
        placeholder = QLabel("Run simulation to\nview strategy weights")
        placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        placeholder.setStyleSheet("color: #888; padding: 30px; font-size: 10pt;")
        self.weights_container_layout.addWidget(placeholder)
        self.weights_container_layout.addStretch()
        
        self.weights_scroll.setWidget(self.weights_container)
        layout.addWidget(self.weights_scroll)
        
        # Install event handlers for drag-and-drop
        self.weights_container.setMouseTracking(True)
        self.weights_scroll.setMouseTracking(True)
        self.weights_container.mouseMoveEvent = self._section_drag_move
        self.weights_container.mouseReleaseEvent = self._end_section_drag
        
        # Create loading overlay (initially hidden)
        self._create_loading_overlay()
        
        self.deselect_btn = QPushButton("Deselect Game")
        self.deselect_btn.clicked.connect(self.deselect_game)
        self.deselect_btn.setEnabled(False)
        layout.addWidget(self.deselect_btn)
        
        panel.setLayout(layout)
        
        # Create loading overlay (initially hidden)
        self._create_loading_overlay()
        
        return panel
    
    def _create_loading_overlay(self):
        """Create an animated loading overlay for the strategy weights panel."""
        # Create overlay frame that covers the scroll area
        self.loading_overlay = QFrame(self.weights_scroll)
        self.loading_overlay.setStyleSheet("""
            QFrame {
                background-color: rgba(26, 26, 26, 240);
                border: 2px solid #404040;
                border-radius: 8px;
            }
        """)
        self.loading_overlay.setFrameShape(QFrame.Shape.StyledPanel)
        
        # Layout for loading content
        overlay_layout = QVBoxLayout(self.loading_overlay)
        overlay_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Spinner label (animated with text)
        self.loading_spinner = QLabel()
        self.loading_spinner.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_spinner.setStyleSheet("""
            QLabel {
                color: #e8e8e8;
                font-size: 24pt;
                font-weight: bold;
                padding: 10px;
            }
        """)
        overlay_layout.addWidget(self.loading_spinner)
        
        # Loading text
        self.loading_text = QLabel("Loading Iteration Data...")
        self.loading_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_text.setStyleSheet("""
            QLabel {
                color: #d0d0d0;
                font-size: 11pt;
                font-weight: bold;
                padding: 5px;
            }
        """)
        overlay_layout.addWidget(self.loading_text)
        
        # Progress bar
        self.loading_progress = QProgressBar()
        self.loading_progress.setRange(0, 100)
        self.loading_progress.setValue(0)
        self.loading_progress.setTextVisible(True)
        self.loading_progress.setFormat("%p%")
        self.loading_progress.setFixedWidth(300)
        self.loading_progress.setFixedHeight(25)
        self.loading_progress.setStyleSheet("""
            QProgressBar {
                border: 2px solid #404040;
                border-radius: 5px;
                background-color: #1a1a1a;
                text-align: center;
                color: #d0d0d0;
                font-weight: bold;
                font-size: 10pt;
            }
            QProgressBar::chunk {
                background: qlineargradient(
                    x1:0, y1:0, x2:1, y2:0,
                    stop:0 #606060,
                    stop:1 #808080
                );
                border-radius: 3px;
            }
        """)
        overlay_layout.addWidget(self.loading_progress, alignment=Qt.AlignmentFlag.AlignCenter)
        
        # Stats label
        self.loading_stats = QLabel("")
        self.loading_stats.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_stats.setStyleSheet("""
            QLabel {
                color: #909090;
                font-size: 9pt;
                padding: 10px;
            }
        """)
        overlay_layout.addWidget(self.loading_stats)
        
        # Initially hidden
        self.loading_overlay.hide()
        
        # Connect animation timer
        self.loading_animation_timer.timeout.connect(self._update_loading_animation)
    
    def _update_loading_animation(self):
        """Update the loading spinner animation."""
        spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        self.loading_spinner.setText(spinners[self.loading_animation_frame % len(spinners)])
        self.loading_animation_frame += 1
    
    def _show_loading_overlay(self):
        """Show and position the loading overlay."""
        # Resize overlay to cover the scroll area
        self.loading_overlay.setGeometry(self.weights_scroll.rect())
        self.loading_overlay.show()
        self.loading_overlay.raise_()
        
        # Start animation
        self.loading_animation_frame = 0
        self.loading_animation_timer.start()
    
    def _hide_loading_overlay(self):
        """Hide the loading overlay and stop animation."""
        self.loading_animation_timer.stop()
        self.loading_overlay.hide()
    
    def apply_dark_theme(self):
        """Apply dark theme styling."""
        self.setStyleSheet("""
            QMainWindow {
                background-color: #0b0c0e;
            }
            QGroupBox {
                color: #d8d9da;
                border: 1px solid #2e2e32;
                border-radius: 8px;
                margin-top: 10px;
                padding-top: 10px;
                background-color: #161719;
            }
            QGroupBox::title {
                color: #707070;
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
            QLabel {
                color: #d8d9da;
            }
            QComboBox, QSpinBox {
                background-color: #1f1f20;
                border: 1px solid #2e2e32;
                border-radius: 4px;
                padding: 5px;
                color: #d8d9da;
            }
            QSlider::groove:horizontal {
                background: #2e2e32;
                height: 6px;
                border-radius: 3px;
            }
            QSlider::handle:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #707070, stop:1 #707070);
                width: 18px;
                margin: -6px 0;
                border-radius: 9px;
                border: 2px solid #3a3a3a;
            }
            QSlider::handle:horizontal:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #808080, stop:1 #707070);
                width: 20px;
                margin: -7px 0;
            }
            QPushButton {
                background-color: #505050;
                color: #e8e8e8;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: bold;
                transition: all 0.3s ease;
            }
            QPushButton:hover {
                background-color: #656565;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(80, 80, 80, 0.5);
            }
            QPushButton:pressed {
                background-color: #3a3a3a;
                transform: translateY(0px);
            }
            QPushButton:disabled {
                background-color: #2e2e32;
                color: #6e6e6e;
            }
            QProgressBar {
                border: 1px solid #2e2e32;
                border-radius: 4px;
                background-color: #1f1f20;
                text-align: center;
                color: #d8d9da;
                height: 20px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #606060, stop:0.5 #707070, stop:1 #808080);
                border-radius: 4px;
            }
            QTextEdit {
                background-color: #1f1f20;
                border: 1px solid #2e2e32;
                border-radius: 4px;
                color: #d8d9da;
            }
            QTabWidget::pane {
                border: 1px solid #2e2e32;
                border-radius: 4px;
                background-color: #161719;
            }
            QTabBar::tab {
                background-color: #1f1f20;
                color: #9fa0a4;
                padding: 8px 16px;
                margin: 2px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                transition: all 0.2s ease;
            }
            QTabBar::tab:selected {
                background-color: #505050;
                color: #e8e8e8;
                font-weight: bold;
            }
            QTabBar::tab:hover:!selected {
                background-color: #2e2e32;
                color: #d8d9da;
            }
        """)
    
    def start_simulation(self):
        """Start the simulation."""
        # Get selected game sizes for mixed mode
        selected_sizes = [size for size, checkbox in self.size_checkboxes.items() if checkbox.isChecked()]
        
        # Validate mixed mode has at least one size selected
        if self.mode_combo.currentIndex() == 2 and not selected_sizes:
            self.status_text.setPlainText("Error: Please select at least one game size for Mixed Sizes mode.")
            return
        
        # Get configuration (use spin boxes which have extended ranges)
        config = {
            'mode': ['wang', 'random', 'mixed'][self.mode_combo.currentIndex()],
            'batch': self.batch_spin.value(),
            'iterations': self.iter_spin.value(),
            'chunk': self.chunk_spin.value(),
            'seed': self.seed_spin.value(),
            'sizes': sorted(selected_sizes) if selected_sizes else [3, 5, 7, 10]
        }
        
        # Reset state
        self.iterations = []
        self.all_gaps = []
        self.all_row_counts = []
        self.all_col_counts = []
        self.game_matrices = []
        self.strategy_cache.clear()  # Clear pre-loaded cache
        self.selected_game = None
        self.plot_widget.clear()
        self.alpha_plot.clear()
        self.ratio_plot.clear()
        self.progress_bar.setValue(0)
        
        # Update UI
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.mode_combo.setEnabled(False)
        self.batch_slider.setEnabled(False)
        self.batch_spin.setEnabled(False)
        self.iter_slider.setEnabled(False)
        self.iter_spin.setEnabled(False)
        self.chunk_slider.setEnabled(False)
        self.chunk_spin.setEnabled(False)
        self.seed_spin.setEnabled(False)
        # Disable size checkboxes during simulation
        for checkbox in self.size_checkboxes.values():
            checkbox.setEnabled(False)
        
        # Reset and enable game selector, but keep iteration slider disabled until pre-loading completes
        self.game_select_spin.setValue(1)
        self.game_select_spin.setEnabled(True)
        self.iter_select_slider.setValue(1)
        self.iter_select_slider.setEnabled(False)  # Disabled during simulation, enabled after pre-loading
        self.iter_select_spin.setValue(1)
        self.iter_select_spin.setEnabled(False)  # Disabled during simulation, enabled after pre-loading
        
        # Start worker thread
        self.worker = SimulationWorker(config)
        self.worker.update_signal.connect(self.on_simulation_update)
        self.worker.finished_signal.connect(self.on_simulation_finished)
        self.worker.start()
        
        # Build status message
        status_msg = f"Simulation started...\nMode: {config['mode']}\nBatch: {config['batch']}"
        if config['mode'] == 'mixed':
            status_msg += f"\nGame sizes: {config['sizes']}"
        self.status_text.setPlainText(status_msg)
    
    def stop_simulation(self):
        """Stop the simulation."""
        if self.worker:
            self.worker.stop()
            self.worker.wait()
        self.reset_ui()
    
    def _animate_tab_change(self, index):
        """Animate tab transitions with smooth fade effect and complete re-rendering (React useEffect style)."""
        # Store previous tab index
        previous_tab = self.current_tab_index
        self.current_tab_index = index
        
        current_widget = self.tab_widget.widget(index)
        if current_widget:
            effect = QGraphicsOpacityEffect(current_widget)
            current_widget.setGraphicsEffect(effect)
            
            animation = QPropertyAnimation(effect, b"opacity")
            animation.setDuration(200)
            animation.setStartValue(0.0)
            animation.setEndValue(1.0)
            animation.setEasingCurve(QEasingCurve.Type.InOutQuad)
            animation.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)
            
            # Store animation reference to prevent garbage collection
            self._current_animation = animation
        
        # Mark previous tab as needing refresh when revisited
        self.tab_needs_refresh[previous_tab] = True
        
        # Force complete re-render of current tab (useEffect-style)
        if index == 0:  # Analysis tab
            # Schedule complete refresh after animation
            QTimer.singleShot(250, self._render_analysis_tab)
        elif index == 1:  # 3D tab
            # Schedule complete 3D refresh after animation
            QTimer.singleShot(250, self._render_3d_tab)
    
    def _render_analysis_tab(self):
        """Complete re-render of analysis tab (React useEffect style)."""
        if not self.iterations or not self.all_gaps:
            return
        
        # Check if data has changed since last render
        data_changed = (
            self.last_rendered_data['iterations'] != len(self.iterations) or
            self.last_rendered_data['gaps'] != len(self.all_gaps)
        )
        
        # Only re-render if data changed or tab needs refresh
        if data_changed or self.tab_needs_refresh[0]:
            t = np.array(self.iterations)
            safe_t = np.maximum(t, 1)
            all_gaps_array = np.array(self.all_gaps)
            avg_gaps = np.mean(all_gaps_array, axis=0)
            safe_gaps = np.maximum(avg_gaps, 1e-15)
            
            # Re-render Alpha plot
            if len(t) > 200:
                self.alpha_plot.clear()
                window = max(200, len(t) // 10)
                log_t = np.log10(safe_t)
                log_g = np.log10(safe_gaps)
                slope_est = (log_g[window:] - log_g[:-window]) / (log_t[window:] - log_t[:-window])
                t_slope = t[window:]
                self.alpha_plot.plot(t_slope, slope_est, pen=pg.mkPen(color=(51, 181, 229), width=2))
                self.alpha_plot.addLine(y=-0.5, pen=pg.mkPen(color=(115, 191, 105), style=Qt.PenStyle.DashLine))
                self.alpha_plot.addLine(y=-0.333, pen=pg.mkPen(color=(242, 73, 92), style=Qt.PenStyle.DashLine))
            
            # Re-render Ratio plot
            self.ratio_plot.clear()
            karlin_theoretical = 1.0 / np.sqrt(safe_t)
            ratio = avg_gaps / karlin_theoretical
            self.ratio_plot.plot(t, ratio, pen=pg.mkPen(color=(255, 152, 48), width=2.5))
            
            # Force complete redraw - critical for Qt visibility after tab switch
            self.alpha_plot.update()
            self.ratio_plot.update()
            self.alpha_plot.getViewBox().updateAutoRange()
            self.ratio_plot.getViewBox().updateAutoRange()
            
            # Force axis visibility restoration
            self.alpha_plot.showAxis('left', True)
            self.alpha_plot.showAxis('bottom', True)
            self.ratio_plot.showAxis('left', True)
            self.ratio_plot.showAxis('bottom', True)
            self.alpha_plot.getAxis('left').show()
            self.alpha_plot.getAxis('bottom').show()
            self.ratio_plot.getAxis('left').show()
            self.ratio_plot.getAxis('bottom').show()
            
            # Force re-apply labels and titles
            self.alpha_plot.setLabel('left', 'Exponent α (Slope)')
            self.alpha_plot.setLabel('bottom', 'Iteration')
            self.alpha_plot.setTitle('Convergence Rate Estimate (α)')
            self.ratio_plot.setLabel('left', 'Ratio (Actual/Theory)')
            self.ratio_plot.setLabel('bottom', 'Iteration')
            self.ratio_plot.setTitle('Gap / Karlin Bound Ratio')
            
            # Hide corner tick marks that appear as black squares
            for ax in ['left', 'bottom', 'right', 'top']:
                self.alpha_plot.getAxis(ax).setStyle(showValues=True if ax in ['left', 'bottom'] else False)
                self.ratio_plot.getAxis(ax).setStyle(showValues=True if ax in ['left', 'bottom'] else False)
            
            # Force complete widget repaint
            self.alpha_plot.repaint()
            self.ratio_plot.repaint()
            
            QApplication.processEvents()
            
            # Mark as refreshed
            self.tab_needs_refresh[0] = False
            self.last_rendered_data['iterations'] = len(self.iterations)
            self.last_rendered_data['gaps'] = len(self.all_gaps)
    
    def _refresh_2d_plots(self):
        """Legacy refresh method - calls new renderer."""
        self._render_analysis_tab()
    
    def on_simulation_update(self, data):
        """Handle simulation updates with smooth real-time plotting."""
        self.iterations = data['iterations']
        self.all_gaps = data['all_gaps']
        self.all_row_counts = data.get('row_counts', [])
        self.all_col_counts = data.get('col_counts', [])
        self.game_matrices = data.get('matrices', [])
        
        # Update progress bar directly for stability
        target_progress = int(data['progress'])
        self.progress_bar.setValue(target_progress)
        
        # Update status with simulation parameters
        self.status_text.setPlainText(
            f"Iteration: {data['iteration']:,}\n"
            f"Avg Gap: {data['avg_gap']:.6e}\n"
            f"Active Games: {len(self.all_gaps)}\n"
            f"\n"
            f"Parameters:\n"
            f"  Mode: {self.worker.config['mode'].capitalize()}\n"
            f"  Batch Size: {self.worker.config['batch']}\n"
            f"  Total Iters: {self.worker.config['iterations']:,}\n"
            f"  Chunk Size: {self.worker.config['chunk']}\n"
            f"  Seed: {self.worker.config['seed']}"
        )
        
        # Update weights panel controls ranges
        if len(self.all_gaps) > 0:
            self.game_select_spin.setMaximum(len(self.all_gaps))
            if self.game_select_spin.value() > len(self.all_gaps):
                self.game_select_spin.setValue(1)
        
        if len(self.iterations) > 0:
            self.iter_select_slider.setMaximum(len(self.iterations))
            self.iter_select_spin.setMaximum(len(self.iterations))
            # Only update values if sliders are enabled (during real-time simulation they stay disabled)
            if self.iter_select_slider.isEnabled():
                # Keep slider at latest iteration by default
                self.iter_select_slider.setValue(len(self.iterations))
                self.iter_select_spin.setValue(len(self.iterations))
        
        # Update plots in real-time with smooth rendering
        self.update_plots()
        
        # Update weights display if game is selected
        if self.selected_game is not None:
            self._update_weights_display()
    
    def on_simulation_finished(self, stats):
        """Handle simulation completion and pre-load all iteration data."""
        # Ensure progress bar reaches 100%
        self.progress_bar.setValue(100)
        
        # Display statistics with simulation parameters
        stats_text = (
            f"SIMULATION COMPLETE\n\n"
            f"Total Iterations: {stats['total_iterations']:,}\n\n"
            f"Gap Statistics:\n"
            f"  Mean:   {stats['gap_mean']:.6e}\n"
            f"  Median: {stats['gap_median']:.6e}\n"
            f"  Min:    {stats['gap_min']:.6e}\n"
            f"  Max:    {stats['gap_max']:.6e}\n"
            f"  Std:    {stats['gap_std']:.6e}\n\n"
            f"Karlin Ratio:\n"
            f"  Mean:   {stats['ratio_mean']:.4f}\n"
            f"  Median: {stats['ratio_median']:.4f}\n\n"
            f"Theory: {stats['theoretical_bound']:.6e}\n"
            f"Ratio:  {stats['ratio_to_theory']:.4f}\n\n"
            f"Parameters:\n"
            f"  Mode: {self.worker.config['mode'].capitalize()}\n"
            f"  Batch Size: {self.worker.config['batch']}\n"
            f"  Chunk Size: {self.worker.config['chunk']}\n"
            f"  Seed: {self.worker.config['seed']}"
        )
        self.status_text.setPlainText(stats_text)
        
        # Pre-load all iteration data before enabling slider
        self._preload_all_iterations()
    
    def _preload_all_iterations(self):
        """Pre-compute and cache strategy data for all iterations to enable seamless slider interaction."""
        if not self.all_row_counts or not self.all_col_counts:
            self.reset_ui()
            return
        
        self.is_loading_iterations = True
        
        # Keep iteration slider disabled during pre-loading
        self.iter_select_slider.setEnabled(False)
        self.iter_select_spin.setEnabled(False)
        
        # Update status to show loading progress
        num_games = len(self.all_row_counts)
        num_iterations = len(self.all_row_counts[0]) if num_games > 0 else 0
        total_to_load = num_games * num_iterations
        
        # Memory-safe threshold: Don't cache if total exceeds 500k data points (prevents crashes)
        CACHE_THRESHOLD = 500000
        use_cache = total_to_load <= CACHE_THRESHOLD
        
        if use_cache:
            # Show animated loading overlay
            self._show_loading_overlay()
            self.loading_progress.setValue(0)
            self.loading_stats.setText(
                f"Games: {num_games} | Iterations: {num_iterations:,}\n"
                f"Total: {total_to_load:,} data points"
            )
            
            self.status_text.setPlainText(
                f"Loading iteration data...\n\n"
                f"Games: {num_games}\n"
                f"Iterations: {num_iterations:,}\n"
                f"Total data points: {total_to_load:,}\n\n"
                f"Please wait..."
            )
            
            # Clear cache
            self.strategy_cache.clear()
            
            # Pre-compute strategies for all iterations and all games
            loaded = 0
            for game_idx in range(num_games):
                for iter_idx in range(num_iterations):
                    t = iter_idx + 1
                    
                    # Get count vectors at this iteration
                    row_counts = self.all_row_counts[game_idx][iter_idx]
                    col_counts = self.all_col_counts[game_idx][iter_idx]
                    
                    # Compute strategies (normalize counts)
                    row_strategy = row_counts / t if t > 0 else row_counts
                    col_strategy = col_counts / t if t > 0 else col_counts
                    
                    # Cache the computed strategies
                    self.strategy_cache[(game_idx, iter_idx)] = (row_strategy, col_strategy)
                    
                    loaded += 1
                    
                    # Update progress more frequently for smoother animation (every 100 items)
                    if loaded % 100 == 0 or loaded == total_to_load:
                        progress = int((loaded / total_to_load) * 100)
                        self.loading_progress.setValue(progress)
                        self.loading_text.setText(
                            f"Loading Iteration Data... {loaded:,} / {total_to_load:,}"
                        )
                        self.status_text.setPlainText(
                            f"Loading iteration data...\n\n"
                            f"Progress: {loaded:,} / {total_to_load:,}\n"
                            f"({progress}%)\n\n"
                            f"Please wait..."
                        )
                        QApplication.processEvents()  # Keep UI responsive
            
            # Hide loading overlay
            self._hide_loading_overlay()
        else:
            # Skip caching for large datasets to prevent memory overflow
            self.strategy_cache.clear()
            self.status_text.setPlainText(
                f"⚠ LARGE DATASET DETECTED\n\n"
                f"Games: {num_games}\n"
                f"Iterations: {num_iterations:,}\n"
                f"Total: {total_to_load:,} data points\n\n"
                f"Caching disabled to prevent memory overflow.\n"
                f"Strategy weights will compute on-demand.\n"
                f"(May have slight delay when sliding)"
            )
        
        # Show completion message
        if use_cache:
            # Hide loading overlay
            self._hide_loading_overlay()
            
            self.status_text.setPlainText(
                f"✓ ALL DATA LOADED\n\n"
                f"Games: {num_games}\n"
                f"Iterations: {num_iterations:,}\n"
                f"Cached: {total_to_load:,} data points\n\n"
                # f"Slider ready for seamless interaction!\n\n"
                f"Parameters:\n"
                f"  Mode: {self.worker.config['mode'].capitalize()}\n"
                f"  Batch Size: {self.worker.config['batch']}\n"
                f"  Chunk Size: {self.worker.config['chunk']}\n"
                f"  Seed: {self.worker.config['seed']}"
            )
        
        self.is_loading_iterations = False
        
        # Enable iteration sliders now that data is loaded
        self.iter_select_slider.setEnabled(True)
        self.iter_select_spin.setEnabled(True)
        
        # Select first game by default to show data
        if num_games > 0:
            self.game_select_spin.setValue(1)
            self.selected_game = 0
            self._update_weights_display()
            self.deselect_btn.setEnabled(True)
            
            # Enable export buttons
            self.export_current_btn.setEnabled(True)
            self.export_all_btn.setEnabled(True)
        
        # Reset UI controls
        self.reset_ui()
    
    def update_plots(self):
        """Update all plots with current data and smooth real-time animations."""
        if not self.iterations or not self.all_gaps:
            return
        
        t = np.array(self.iterations)
        safe_t = np.maximum(t, 1)
        
        # Clear and redraw with smooth transitions
        self.plot_widget.clear()
        self.game_curves = []  # Reset curve references
        
        # Enable antialiasing and performance optimizations for smooth real-time plotting
        self.plot_widget.setAntialiasing(True)
        self.plot_widget.setClipToView(True)  # Only render visible data
        self.plot_widget.setDownsampling(auto=True)  # Automatic downsampling for performance
        
        # Clear legend
        if self.plot_legend:
            self.plot_legend.clear()
        
        # Calculate average
        all_gaps_array = np.array(self.all_gaps)
        avg_gaps = np.mean(all_gaps_array, axis=0)
        
        # Plot average line with smooth connections
        avg_curve = self.plot_widget.plot(t, avg_gaps, pen=pg.mkPen(color=(250, 222, 42), width=2.5), 
                                         name="Average Gap", connect='all', antialias=True)
        
        # Plot Karlin bound
        start_gap = avg_gaps[0]
        c_karl = start_gap * np.sqrt(safe_t[0])
        karlin_bound = c_karl / np.sqrt(safe_t)
        karl_curve = self.plot_widget.plot(t, karlin_bound, pen=pg.mkPen(color=(115, 191, 105), width=2, style=Qt.PenStyle.DashLine), 
                                          name="Karlin O(t⁻¹/²)", connect='all', antialias=True)
        
        # Plot Wang bound
        c_wang = start_gap * (safe_t[0]**(1/3))
        wang_bound = c_wang * (safe_t**(-1/3))
        wang_curve = self.plot_widget.plot(t, wang_bound, pen=pg.mkPen(color=(242, 73, 92), width=2, style=Qt.PenStyle.DotLine), 
                                          name="Wang Ω(t⁻¹/³)", connect='all', antialias=True)
        
        # Plot individual games with smooth selection animation
        for i, gaps in enumerate(self.all_gaps):
            color = self.COLORS[i % len(self.COLORS)]
            
            # Smooth width and alpha transitions
            if self.selected_game == i:
                width = 3.5
                alpha = 255
                # Add subtle glow effect for selected game
                shadow_pen = pg.mkPen(color=(*color, 100), width=5)
                self.plot_widget.plot(t, gaps, pen=shadow_pen)
            elif self.selected_game is None:
                width = 1.8
                alpha = 200
            else:
                width = 1.2
                alpha = 60
            
            pen = pg.mkPen(color=(*color, alpha), width=width, style=Qt.PenStyle.SolidLine)
            # Only add first game to legend as representative of all games
            name = f"Individual Games (1-{len(self.all_gaps)})" if i == 0 else None
            curve = self.plot_widget.plot(t, gaps, pen=pen, name=name, connect='all', antialias=True)
            self.game_curves.append((i, curve))  # Store game index with curve
        
        # Update alpha plot with smooth rendering
        if len(t) > 200:
            self.alpha_plot.clear()
            self.alpha_plot.setAntialiasing(True)
            self.alpha_plot.setClipToView(True)
            
            window = max(200, len(t) // 10)
            log_t = np.log10(safe_t)
            log_g = np.log10(np.maximum(avg_gaps, 1e-15))
            slope_est = (log_g[window:] - log_g[:-window]) / (log_t[window:] - log_t[:-window])
            t_slope = t[window:]
            self.alpha_plot.plot(t_slope, slope_est, pen=pg.mkPen(color=(51, 181, 229), width=2), 
                               connect='all', antialias=True)
            self.alpha_plot.addLine(y=-0.5, pen=pg.mkPen(color=(115, 191, 105), style=Qt.PenStyle.DashLine))
            self.alpha_plot.addLine(y=-0.333, pen=pg.mkPen(color=(242, 73, 92), style=Qt.PenStyle.DashLine))
        
        # Update ratio plot with smooth rendering
        self.ratio_plot.clear()
        self.ratio_plot.setAntialiasing(True)
        self.ratio_plot.setClipToView(True)
        
        # Calculate ratio: Gap / (1/sqrt(t)) to find the constant C where Gap(t) ≈ C/sqrt(t)
        # If converging at Karlin rate, this ratio should stabilize to constant C
        karlin_theoretical = 1.0 / np.sqrt(safe_t)
        ratio = avg_gaps / karlin_theoretical
        self.ratio_plot.plot(t, ratio, pen=pg.mkPen(color=(255, 152, 48), width=2.5), 
                           connect='all', antialias=True)
        # No reference line - we're finding what constant C the ratio stabilizes to
        
        # Only update the currently active tab (React useEffect pattern)
        # Mark other tabs for refresh on next visit
        if self.current_tab_index == 0:
            # Analysis tab is active - already updated above
            self.tab_needs_refresh[1] = True  # 3D needs refresh when visited
        elif self.current_tab_index == 1:
            # 3D tab is active - update it
            self._update_3d_plot()
            self.tab_needs_refresh[0] = True  # Analysis needs refresh when visited
        else:
            # Neither tab active, mark both for refresh
            self.tab_needs_refresh[0] = True
            self.tab_needs_refresh[1] = True
    
    def _render_3d_tab(self):
        """Complete re-render of 3D tab (React useEffect style)."""
        if not self.iterations or not self.all_gaps:
            return
        
        # Check if data has changed or tab needs refresh
        data_changed = (
            self.last_rendered_data['iterations'] != len(self.iterations) or
            self.last_rendered_data['gaps'] != len(self.all_gaps)
        )
        
        if data_changed or self.tab_needs_refresh[1]:
            # Show loading animation
            self._show_3d_loading(True)
            
            # Perform complete 3D re-render
            self._update_3d_plot()
            
            # Force complete redraw - critical for OpenGL visibility after tab switch
            self.plot_3d.update()
            QApplication.processEvents()
            
            # Hide loading animation
            self._show_3d_loading(False)
            
            # Mark as refreshed
            self.tab_needs_refresh[1] = False
            self.last_rendered_data['iterations'] = len(self.iterations)
            self.last_rendered_data['gaps'] = len(self.all_gaps)
    
    def _update_3d_plot(self):
        """Update the 3D plot with smooth animations, clean rendering, and axis labels."""
        # Clear previous items with fade out effect
        for item in self.plot_3d_items:
            self.plot_3d.removeItem(item)
        self.plot_3d_items.clear()
        
        # Enable antialiasing for smoother 3D lines
        self.plot_3d.setBackgroundColor('#161719')
        
        if not self.iterations or not self.all_gaps:
            return
        
        t = np.array(self.iterations)
        safe_t = np.maximum(t, 1)
        all_gaps_array = np.array(self.all_gaps)
        avg_gaps = np.mean(all_gaps_array, axis=0)
        
        # Normalize iterations for better visualization (scale to 0-10 range)
        t_normalized = 10 * (t - t[0]) / (t[-1] - t[0]) if len(t) > 1 else t
        
        # Use log scale for gaps to handle wide range
        log_gaps = np.log10(np.maximum(avg_gaps, 1e-15))
        gap_min = np.min(log_gaps)
        gap_max = np.max(log_gaps)
        gap_range = gap_max - gap_min if gap_max > gap_min else 1
        
        # Plot Karlin bound at y=0
        start_gap = avg_gaps[0]
        c_karl = start_gap * np.sqrt(safe_t[0])
        karlin_bound = c_karl / np.sqrt(safe_t)
        log_karlin = np.log10(np.maximum(karlin_bound, 1e-15))
        karlin_normalized = 5 * (log_karlin - gap_min) / gap_range
        
        karlin_y = np.zeros(len(t))
        karlin_pos = np.column_stack([t_normalized, karlin_y, karlin_normalized])
        karlin_line = gl.GLLinePlotItem(pos=karlin_pos, color=(0.45, 0.75, 0.41, 0.9), width=2.5, antialias=True)
        self.plot_3d.addItem(karlin_line)
        self.plot_3d_items.append(karlin_line)
        
        # Plot Wang bound at y=1
        c_wang = start_gap * (safe_t[0]**(1/3))
        wang_bound = c_wang * (safe_t**(-1/3))
        log_wang = np.log10(np.maximum(wang_bound, 1e-15))
        wang_normalized = 5 * (log_wang - gap_min) / gap_range
        
        wang_y = np.ones(len(t))
        wang_pos = np.column_stack([t_normalized, wang_y, wang_normalized])
        wang_line = gl.GLLinePlotItem(pos=wang_pos, color=(0.95, 0.29, 0.36, 0.9), width=2.5, antialias=True)
        self.plot_3d.addItem(wang_line)
        self.plot_3d_items.append(wang_line)
        
        # Plot individual games starting from y=2
        for i, gaps in enumerate(self.all_gaps):
            log_game_gaps = np.log10(np.maximum(gaps, 1e-15))
            game_normalized = 5 * (log_game_gaps - gap_min) / gap_range
            
            game_y = np.full(len(t), 2 + i)
            game_pos = np.column_stack([t_normalized, game_y, game_normalized])
            
            # Get color from COLORS list and normalize to 0-1 range
            color = self.COLORS[i % len(self.COLORS)]
            color_normalized = (color[0]/255, color[1]/255, color[2]/255, 0.8)
            
            game_line = gl.GLLinePlotItem(pos=game_pos, color=color_normalized, width=1.5, antialias=True)
            self.plot_3d.addItem(game_line)
            self.plot_3d_items.append(game_line)
        
        # Add grid with subtle appearance
        grid = gl.GLGridItem()
        grid.setSize(x=12, y=max(5, len(self.all_gaps) + 3), z=6)
        grid.setSpacing(x=2, y=1, z=1)
        grid.translate(5, (len(self.all_gaps) + 2) / 2, 2.5)
        # Make grid more subtle
        grid.setColor((0.18, 0.18, 0.20, 0.5))
        self.plot_3d.addItem(grid)
        self.plot_3d_items.append(grid)
        
        # Add axis system with labels
        self._add_3d_axis_labels(t, len(self.all_gaps))
        
        # Add text overlays for axis labels (using Qt labels positioned over OpenGL widget)
        self._add_3d_axis_text_labels()
        
        # Smooth camera position (no jarring jumps)
        self.plot_3d.setCameraPosition(distance=40, elevation=20, azimuth=45)
    
    def _show_3d_loading(self, show):
        """Show or hide 3D loading animation."""
        if show:
            # Center the overlay
            parent_rect = self.plot_3d.geometry()
            overlay_x = (parent_rect.width() - self.loading_3d_overlay.width()) // 2
            overlay_y = (parent_rect.height() - self.loading_3d_overlay.height()) // 2
            self.loading_3d_overlay.move(overlay_x, overlay_y)
            
            self.loading_3d_overlay.show()
            self.loading_3d_overlay.raise_()
            self.loading_3d_frame = 0
            self.loading_3d_timer.start(100)  # 10 FPS
            QApplication.processEvents()
        else:
            self.loading_3d_timer.stop()
            self.loading_3d_overlay.hide()
    
    def _update_3d_loading_animation(self):
        """Update the 3D loading spinner animation."""
        spinner_frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        self.loading_3d_spinner_label.setText(spinner_frames[self.loading_3d_frame % len(spinner_frames)])
        self.loading_3d_frame += 1
    
    def _add_3d_axis_text_labels(self):
        """Add text labels for 3D plot axes as overlay."""
        # Note: Since PyQtGraph's GLViewWidget doesn't support native text,
        # we rely on the tab title and colored axis lines with endpoint markers
        # The tab title clearly identifies: X=Iterations(blue), Y=Game(green), Z=Gap(red)
        pass  # Implementation uses tab title and color coding
    
    def _add_3d_axis_labels(self, t, num_games):
        """Add labeled axes to 3D plot: X=Iterations, Y=Game Index, Z=Duality Gap."""
        if len(t) == 0:
            return
        
        # Create axis lines with proper colors
        # X-axis (Iterations) - Blue
        x_axis_pts = np.array([[0, 0, 0], [10, 0, 0]])
        x_axis = gl.GLLinePlotItem(pos=x_axis_pts, color=(0.2, 0.6, 0.9, 1.0), width=3, antialias=True)
        self.plot_3d.addItem(x_axis)
        self.plot_3d_items.append(x_axis)
        
        # Y-axis (Game Index) - Green
        y_axis_pts = np.array([[0, 0, 0], [0, num_games + 2, 0]])
        y_axis = gl.GLLinePlotItem(pos=y_axis_pts, color=(0.45, 0.75, 0.41, 1.0), width=3, antialias=True)
        self.plot_3d.addItem(y_axis)
        self.plot_3d_items.append(y_axis)
        
        # Z-axis (Duality Gap) - Red
        z_axis_pts = np.array([[0, 0, 0], [0, 0, 5]])
        z_axis = gl.GLLinePlotItem(pos=z_axis_pts, color=(0.95, 0.29, 0.36, 1.0), width=3, antialias=True)
        self.plot_3d.addItem(z_axis)
        self.plot_3d_items.append(z_axis)
        
        # Add tick marks on X-axis (iterations)
        for i in range(0, 11, 2):
            tick_start = np.array([i, 0, -0.2])
            tick_end = np.array([i, 0, 0])
            tick_pts = np.vstack([tick_start, tick_end])
            tick = gl.GLLinePlotItem(pos=tick_pts, color=(0.6, 0.6, 0.6, 0.8), width=2, antialias=True)
            self.plot_3d.addItem(tick)
            self.plot_3d_items.append(tick)
        
        # Add tick marks on Y-axis (game indices)
        for i in range(0, num_games + 3, 1):
            tick_start = np.array([0, i, -0.2])
            tick_end = np.array([0, i, 0])
            tick_pts = np.vstack([tick_start, tick_end])
            tick = gl.GLLinePlotItem(pos=tick_pts, color=(0.6, 0.6, 0.6, 0.8), width=2, antialias=True)
            self.plot_3d.addItem(tick)
            self.plot_3d_items.append(tick)
        
        # Add tick marks on Z-axis (gap values)
        for i in range(0, 6, 1):
            tick_start = np.array([-0.3, 0, i])
            tick_end = np.array([0, 0, i])
            tick_pts = np.vstack([tick_start, tick_end])
            tick = gl.GLLinePlotItem(pos=tick_pts, color=(0.6, 0.6, 0.6, 0.8), width=2, antialias=True)
            self.plot_3d.addItem(tick)
            self.plot_3d_items.append(tick)
        
        # Create text labels using GLTextItem (approximation with scatter points)
        # Note: OpenGL doesn't have native text, so we create visual indicators
        # Add colored spheres at axis endpoints as labels
        
        # X-axis label marker (Blue sphere at end)
        x_label_marker = gl.GLScatterPlotItem(pos=np.array([[11, 0, 0]]), 
                                             color=(0.2, 0.6, 0.9, 1.0), size=8)
        self.plot_3d.addItem(x_label_marker)
        self.plot_3d_items.append(x_label_marker)
        
        # Y-axis label marker (Green sphere at end)
        y_label_marker = gl.GLScatterPlotItem(pos=np.array([[0, num_games + 3, 0]]), 
                                             color=(0.45, 0.75, 0.41, 1.0), size=8)
        self.plot_3d.addItem(y_label_marker)
        self.plot_3d_items.append(y_label_marker)
        
        # Z-axis label marker (Red sphere at end)
        z_label_marker = gl.GLScatterPlotItem(pos=np.array([[0, 0, 6]]), 
                                             color=(0.95, 0.29, 0.36, 1.0), size=8)
        self.plot_3d.addItem(z_label_marker)
        self.plot_3d_items.append(z_label_marker)
        
        # Add text labels using GLTextItem (PyQtGraph 3D text)
        # Note: GLTextItem may not be available in all versions, so we create visual proxies
        # X-axis label: Create line of small spheres forming "ITERATIONS"
        # For simplicity, we'll add larger spheres at axis ends with tooltips
        
        # Add axis title using the plot's title (updated below)
        # Since OpenGL doesn't support native text easily, we rely on the tab title
        # and the colored endpoint markers to indicate axes
    
    def on_plot_clicked(self, event):
        """Handle mouse clicks on the plot."""
        if event.button() == Qt.MouseButton.LeftButton:
            # Get click position in scene coordinates
            pos = event.scenePos()
            
            # Map to view (data) coordinates - don't check bounds, let user click anywhere in plot
            try:
                mouse_point = self.plot_widget.plotItem.vb.mapSceneToView(pos)
                click_x = mouse_point.x()
                click_y = mouse_point.y()
            except:
                return
            
            # In log mode, mapSceneToView returns log10 values, not original data values
            # Convert back to data space if in log mode
            if self.log_scale:
                try:
                    click_x = 10 ** click_x
                    click_y = 10 ** click_y
                except:
                    return
            
            # Ensure click coordinates are positive
            if click_x <= 0 or click_y <= 0:
                return
            
            # Check if we have any games to select
            if not self.game_curves or not self.all_gaps:
                return
            
            # Find closest game curve
            min_distance = float('inf')
            closest_game = None
            
            for game_idx, curve in self.game_curves:
                if curve.xData is None or len(curve.xData) == 0:
                    continue
                
                x_data = np.array(curve.xData)
                y_data = np.array(curve.yData)
                
                # Filter positive values
                valid_mask = (x_data > 0) & (y_data > 0)
                if not np.any(valid_mask):
                    continue
                x_data = x_data[valid_mask]
                y_data = y_data[valid_mask]
                
                if len(x_data) == 0 or len(y_data) == 0:
                    continue
                
                # Calculate distances in log space (appropriate for log-scale data)
                try:
                    log_click_x = np.log10(click_x)
                    log_click_y = np.log10(click_y)
                    log_x_data = np.log10(x_data)
                    log_y_data = np.log10(y_data)
                except:
                    continue
                
                # Calculate distances in log space
                x_distances = np.abs(log_x_data - log_click_x)
                y_distances = np.abs(log_y_data - log_click_y)
                
                # Normalize by log range
                x_range = np.ptp(log_x_data)
                y_range = np.ptp(log_y_data)
                
                # Normalized distance (give more weight to vertical distance for easier selection)
                if x_range > 0 and y_range > 0:
                    normalized_distances = (x_distances / x_range) * 0.5 + (y_distances / y_range) * 1.5
                else:
                    normalized_distances = x_distances + y_distances
                
                # Find minimum distance for this curve
                curve_min_distance = np.min(normalized_distances)
                
                if curve_min_distance < min_distance:
                    min_distance = curve_min_distance
                    closest_game = game_idx
            
            # Select game if close enough (increased threshold to 0.3 for easier selection)
            if closest_game is not None and min_distance < 0.3:
                self.select_game(closest_game)
            else:
                # Provide feedback if no game was close enough
                self.status_text.setPlainText(f"Click closer to a game line to select it.\nClosest distance: {min_distance:.3f}")
        
        elif event.button() == Qt.MouseButton.RightButton:
            # Right click to deselect
            self.deselect_game()
    
    def select_game(self, game_idx):
        """Select a game with smooth animation and display its weights."""
        self.selected_game = game_idx
        self.deselect_btn.setEnabled(True)
        
        # Sync game selector
        self.game_select_spin.blockSignals(True)
        self.game_select_spin.setValue(game_idx + 1)
        self.game_select_spin.blockSignals(False)
        
        # Animate button enable with color transition
        self.deselect_btn.setStyleSheet(
            "QPushButton { background-color: #5a5a5a; }"
            "QPushButton:hover { background-color: #6a6a6a; }"
        )
        
        # Update plot title with color
        color = self.COLORS[game_idx % len(self.COLORS)]
        color_hex = '#{:02x}{:02x}{:02x}'.format(*color)
        self.plot_widget.setTitle(
            f"<span style='color: {color_hex}; font-weight: bold;'>Game {game_idx + 1} Selected</span> - Duality Gap Convergence"
        )
        
        # Update plot to highlight selected game
        self.update_plots()
        
        # Update weights display
        self._update_weights_display()
    
    def deselect_game(self):
        """Deselect the currently selected game with smooth animation."""
        self.selected_game = None
        
        # Reset title with fade effect
        self.plot_widget.setTitle("Duality Gap Convergence - Click game line to select")
        
        # Animate weights panel clear
        self.weights_text.setPlainText(
            "No game selected\n\n"
            "Click on a game line\n"
            "to view weights"
        )
        
        # Reset button style
        self.deselect_btn.setStyleSheet("")
        self.deselect_btn.setEnabled(False)
        
        # Update plots with smooth transition
        self.update_plots()
    
    def toggle_log_scale(self):
        """Toggle between log and linear scale for the main plot."""
        self.log_scale = not self.log_scale
        self.plot_widget.setLogMode(x=self.log_scale, y=self.log_scale)
        self.log_toggle_btn.setText(f"Log Scale: {'ON' if self.log_scale else 'OFF'}")
        self.update_plots()
    
    def _export_current_game(self):
        """Export current game data for all iterations."""
        if self.selected_game is None or not self.all_row_counts:
            QMessageBox.warning(self, "No Data", "Please select a game to export.")
            return
        
        # Ask user for format
        msg = QMessageBox()
        msg.setWindowTitle("Export Format")
        msg.setText("Choose export format:")
        csv_btn = msg.addButton("CSV", QMessageBox.ButtonRole.AcceptRole)
        md_btn = msg.addButton("Markdown", QMessageBox.ButtonRole.AcceptRole)
        cancel_btn = msg.addButton("Cancel", QMessageBox.ButtonRole.RejectRole)
        msg.exec()
        
        if msg.clickedButton() == cancel_btn:
            return
        
        format_type = "csv" if msg.clickedButton() == csv_btn else "md"
        
        # Get file path
        file_filter = "CSV Files (*.csv)" if format_type == "csv" else "Markdown Files (*.md)"
        default_name = f"game_{self.selected_game + 1}_all_iterations.{format_type}"
        file_path, _ = QFileDialog.getSaveFileName(self, "Export Current Game", default_name, file_filter)
        
        if not file_path:
            return
        
        try:
            game_idx = self.selected_game
            num_iterations = len(self.all_row_counts[game_idx])
            payoff_matrix = self.game_matrices[game_idx]
            
            with open(file_path, 'w') as f:
                if format_type == "csv":
                    # CSV format
                    f.write(f"Game {game_idx + 1} - All Iterations\n")
                    f.write(f"Payoff Matrix Dimensions: {payoff_matrix.shape[0]}x{payoff_matrix.shape[1]}\n\n")
                    f.write("Iteration,Gap,Row Strategy,Column Strategy\n")
                    
                    for iter_idx in range(num_iterations):
                        t = iter_idx + 1
                        gap = self.all_gaps[game_idx][iter_idx]
                        row_counts = self.all_row_counts[game_idx][iter_idx]
                        col_counts = self.all_col_counts[game_idx][iter_idx]
                        row_strategy = row_counts / t
                        col_strategy = col_counts / t
                        
                        row_str = ';'.join([f"{x:.6f}" for x in row_strategy])
                        col_str = ';'.join([f"{x:.6f}" for x in col_strategy])
                        f.write(f"{t},{gap:.6e},\"{row_str}\",\"{col_str}\"\n")
                else:
                    # Markdown format
                    f.write(f"# Game {game_idx + 1} - All Iterations\n\n")
                    f.write(f"**Payoff Matrix Dimensions:** {payoff_matrix.shape[0]}×{payoff_matrix.shape[1]}\n\n")
                    f.write("| Iteration | Gap | Row Strategy | Column Strategy |\n")
                    f.write("|-----------|-----|--------------|----------------|\n")
                    
                    for iter_idx in range(num_iterations):
                        t = iter_idx + 1
                        gap = self.all_gaps[game_idx][iter_idx]
                        row_counts = self.all_row_counts[game_idx][iter_idx]
                        col_counts = self.all_col_counts[game_idx][iter_idx]
                        row_strategy = row_counts / t
                        col_strategy = col_counts / t
                        
                        row_str = ', '.join([f"{x:.4f}" for x in row_strategy[:5]])
                        col_str = ', '.join([f"{x:.4f}" for x in col_strategy[:5]])
                        if len(row_strategy) > 5:
                            row_str += "..."
                        if len(col_strategy) > 5:
                            col_str += "..."
                        f.write(f"| {t:,} | {gap:.6e} | {row_str} | {col_str} |\n")
            
            QMessageBox.information(self, "Export Success", f"Data exported to:\n{file_path}")
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export data:\n{str(e)}")
    
    def _export_all_games(self):
        """Export all games data for all iterations."""
        if not self.all_row_counts:
            QMessageBox.warning(self, "No Data", "No game data available to export.")
            return
        
        # Ask user for format
        msg = QMessageBox()
        msg.setWindowTitle("Export Format")
        msg.setText("Choose export format:")
        csv_btn = msg.addButton("CSV", QMessageBox.ButtonRole.AcceptRole)
        md_btn = msg.addButton("Markdown", QMessageBox.ButtonRole.AcceptRole)
        cancel_btn = msg.addButton("Cancel", QMessageBox.ButtonRole.RejectRole)
        msg.exec()
        
        if msg.clickedButton() == cancel_btn:
            return
        
        format_type = "csv" if msg.clickedButton() == csv_btn else "md"
        
        # Get file path
        file_filter = "CSV Files (*.csv)" if format_type == "csv" else "Markdown Files (*.md)"
        default_name = f"all_games_all_iterations.{format_type}"
        file_path, _ = QFileDialog.getSaveFileName(self, "Export All Games", default_name, file_filter)
        
        if not file_path:
            return
        
        try:
            num_games = len(self.all_row_counts)
            
            with open(file_path, 'w') as f:
                if format_type == "csv":
                    # CSV format
                    f.write("All Games - All Iterations\n\n")
                    f.write("Game,Iteration,Gap,Row Strategy,Column Strategy\n")
                    
                    for game_idx in range(num_games):
                        num_iterations = len(self.all_row_counts[game_idx])
                        for iter_idx in range(num_iterations):
                            t = iter_idx + 1
                            gap = self.all_gaps[game_idx][iter_idx]
                            row_counts = self.all_row_counts[game_idx][iter_idx]
                            col_counts = self.all_col_counts[game_idx][iter_idx]
                            row_strategy = row_counts / t
                            col_strategy = col_counts / t
                            
                            row_str = ';'.join([f"{x:.6f}" for x in row_strategy])
                            col_str = ';'.join([f"{x:.6f}" for x in col_strategy])
                            f.write(f"{game_idx + 1},{t},{gap:.6e},\"{row_str}\",\"{col_str}\"\n")
                else:
                    # Markdown format
                    f.write("# All Games - All Iterations\n\n")
                    
                    for game_idx in range(num_games):
                        payoff_matrix = self.game_matrices[game_idx]
                        num_iterations = len(self.all_row_counts[game_idx])
                        
                        f.write(f"## Game {game_idx + 1}\n\n")
                        f.write(f"**Payoff Matrix Dimensions:** {payoff_matrix.shape[0]}×{payoff_matrix.shape[1]}\n\n")
                        f.write("| Iteration | Gap | Row Strategy | Column Strategy |\n")
                        f.write("|-----------|-----|--------------|----------------|\n")
                        
                        for iter_idx in range(num_iterations):
                            t = iter_idx + 1
                            gap = self.all_gaps[game_idx][iter_idx]
                            row_counts = self.all_row_counts[game_idx][iter_idx]
                            col_counts = self.all_col_counts[game_idx][iter_idx]
                            row_strategy = row_counts / t
                            col_strategy = col_counts / t
                            
                            row_str = ', '.join([f"{x:.4f}" for x in row_strategy[:5]])
                            col_str = ', '.join([f"{x:.4f}" for x in col_strategy[:5]])
                            if len(row_strategy) > 5:
                                row_str += "..."
                            if len(col_strategy) > 5:
                                col_str += "..."
                            f.write(f"| {t:,} | {gap:.6e} | {row_str} | {col_str} |\n")
                        
                        f.write("\n")
            
            QMessageBox.information(self, "Export Success", f"Data exported to:\n{file_path}")
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export data:\n{str(e)}")
    
    def reset_ui(self):
        """Reset UI controls after simulation."""
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.mode_combo.setEnabled(True)
        # Re-enable size checkboxes
        for checkbox in self.size_checkboxes.values():
            checkbox.setEnabled(True)
        # Re-enable size checkboxes
        for checkbox in self.size_checkboxes.values():
            checkbox.setEnabled(True)
        self.batch_slider.setEnabled(True)
        self.batch_spin.setEnabled(True)
        self.iter_slider.setEnabled(True)
        self.iter_spin.setEnabled(True)
        self.chunk_slider.setEnabled(True)
        self.chunk_spin.setEnabled(True)
        self.seed_spin.setEnabled(True)

def main():
    """Launch the application."""
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Use Fusion style for better cross-platform appearance
    
    window = FPAnalyzerGUI()
    window.show()
    
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
