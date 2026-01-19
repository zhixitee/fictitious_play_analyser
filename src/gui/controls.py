"""Control panels for simulation configuration."""
import numpy as np
from PyQt5.QtWidgets import (
    QGroupBox, QVBoxLayout, QHBoxLayout, QLabel, QSlider, QComboBox, 
    QPushButton, QSpinBox, QProgressBar, QTextEdit, QCheckBox, QScrollArea,
    QWidget, QGridLayout, QTableWidget, QTableWidgetItem, QFileDialog, QMessageBox
)
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont


class ControlPanel(QGroupBox):
    """Main control panel for simulation parameters."""
    
    def __init__(self, parent=None):
        super().__init__("Simulation Controls", parent)
        self.setFixedWidth(300)
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout()
        
        # Mode selection
        mode_layout = QHBoxLayout()
        mode_layout.addWidget(QLabel("Mode:"))
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["Random Games", "Mixed Sizes", "Custom Matrix"])
        mode_layout.addWidget(self.mode_combo)
        layout.addLayout(mode_layout)
        
        # Mixed size configuration
        self.mixed_size_group = self._create_mixed_size_config()
        layout.addWidget(self.mixed_size_group)
        
        # Custom matrix configuration
        self.custom_matrix_group = self._create_custom_matrix_config()
        layout.addWidget(self.custom_matrix_group)
        
        # Batch size control
        layout.addWidget(QLabel("Batch Size:"))
        batch_layout = QHBoxLayout()
        self.batch_slider = QSlider(Qt.Orientation.Horizontal)
        self.batch_slider.setMinimum(1)
        self.batch_slider.setMaximum(20)
        self.batch_slider.setValue(5)
        batch_layout.addWidget(self.batch_slider)
        
        self.batch_spin = QSpinBox()
        self.batch_spin.setMinimum(1)
        self.batch_spin.setMaximum(1000)
        self.batch_spin.setValue(5)
        self.batch_spin.setFixedWidth(80)
        batch_layout.addWidget(self.batch_spin)
        
        self.batch_slider.valueChanged.connect(lambda v: self.batch_spin.setValue(v) if v <= 20 else None)
        self.batch_spin.valueChanged.connect(lambda v: self.batch_slider.setValue(v) if v <= 20 else None)
        layout.addLayout(batch_layout)
        
        # Iterations control
        layout.addWidget(QLabel("Iterations:"))
        iter_layout = QHBoxLayout()
        self.iter_slider = QSlider(Qt.Orientation.Horizontal)
        self.iter_slider.setMinimum(1)
        self.iter_slider.setMaximum(100000)
        self.iter_slider.setValue(10000)
        iter_layout.addWidget(self.iter_slider)
        
        self.iter_spin = QSpinBox()
        self.iter_spin.setMinimum(1)
        self.iter_spin.setMaximum(10000000)
        self.iter_spin.setValue(10)
        self.iter_spin.setFixedWidth(80)
        iter_layout.addWidget(self.iter_spin)
        
        self.iter_slider.valueChanged.connect(lambda v: self.iter_spin.setValue(v))
        self.iter_spin.valueChanged.connect(lambda v: self.iter_slider.setValue(v) if v <= 100000 else None)
        layout.addLayout(iter_layout)
        
        # Chunk size control
        layout.addWidget(QLabel("Chunk Size:"))
        chunk_layout = QHBoxLayout()
        self.chunk_slider = QSlider(Qt.Orientation.Horizontal)
        self.chunk_slider.setMinimum(1)
        self.chunk_slider.setMaximum(500)
        self.chunk_slider.setValue(100)
        chunk_layout.addWidget(self.chunk_slider)
        
        self.chunk_spin = QSpinBox()
        self.chunk_spin.setMinimum(1)
        self.chunk_spin.setMaximum(10000)
        self.chunk_spin.setValue(100)
        self.chunk_spin.setFixedWidth(80)
        chunk_layout.addWidget(self.chunk_spin)
        
        self.chunk_slider.valueChanged.connect(lambda v: self.chunk_spin.setValue(v))
        self.chunk_spin.valueChanged.connect(lambda v: self.chunk_slider.setValue(v) if v <= 500 else None)
        layout.addLayout(chunk_layout)
        
        # Seed control
        seed_layout = QHBoxLayout()
        seed_layout.addWidget(QLabel("Seed:"))
        self.seed_spin = QSpinBox()
        self.seed_spin.setMinimum(0)
        self.seed_spin.setMaximum(99999)
        self.seed_spin.setValue(np.random.randint(0, 99999))
        seed_layout.addWidget(self.seed_spin)
        layout.addLayout(seed_layout)
        
        # Control buttons
        button_layout = QHBoxLayout()
        self.start_btn = QPushButton("Start")
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.setEnabled(False)
        button_layout.addWidget(self.start_btn)
        button_layout.addWidget(self.stop_btn)
        layout.addLayout(button_layout)
        
        # Log scale toggle
        self.log_toggle_btn = QPushButton("Log Scale: ON")
        layout.addWidget(self.log_toggle_btn)
        
        # Visibility toggles
        self.legend_toggle = QCheckBox("Show Legend")
        self.legend_toggle.setChecked(True)
        layout.addWidget(self.legend_toggle)
        
        self.individual_games_toggle = QCheckBox("Show Individual Games")
        self.individual_games_toggle.setChecked(True)
        layout.addWidget(self.individual_games_toggle)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        layout.addWidget(self.progress_bar)
        
        # Status display
        status_group = QGroupBox("Current Status")
        status_layout = QVBoxLayout()
        self.status_text = QTextEdit()
        self.status_text.setReadOnly(True)
        self.status_text.setFont(QFont("Courier", 9))
        status_layout.addWidget(self.status_text)
        status_group.setLayout(status_layout)
        layout.addWidget(status_group, stretch=1)
        
        self.setLayout(layout)
    
    def _create_mixed_size_config(self):
        """Create mixed size configuration panel."""
        group = QGroupBox("Game Sizes Configuration")
        group.setVisible(False)
        layout = QVBoxLayout()
        
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setMaximumHeight(150)
        scroll_widget = QWidget()
        scroll_layout = QGridLayout()
        scroll_widget.setLayout(scroll_layout)
        
        self.size_checkboxes = {}
        default_sizes = [3, 5, 7, 10]
        
        for i, size in enumerate(range(2, 21)):
            checkbox = QCheckBox(f"{size}x{size}")
            checkbox.setChecked(size in default_sizes)
            self.size_checkboxes[size] = checkbox
            scroll_layout.addWidget(checkbox, i // 4, i % 4)
        
        scroll_area.setWidget(scroll_widget)
        layout.addWidget(scroll_area)
        
        button_layout = QHBoxLayout()
        select_all_btn = QPushButton("Select All")
        deselect_all_btn = QPushButton("Clear All")
        button_layout.addWidget(select_all_btn)
        button_layout.addWidget(deselect_all_btn)
        layout.addLayout(button_layout)
        
        group.setLayout(layout)
        return group
    
    def _create_custom_matrix_config(self):
        """Create custom matrix editor panel."""
        group = QGroupBox("Custom Matrix Editor")
        group.setVisible(False)
        layout = QVBoxLayout()
        
        # Dimensions
        dim_layout = QHBoxLayout()
        dim_layout.addWidget(QLabel("Rows:"))
        self.matrix_rows_spin = QSpinBox()
        self.matrix_rows_spin.setMinimum(2)
        self.matrix_rows_spin.setMaximum(20)
        self.matrix_rows_spin.setValue(2)
        dim_layout.addWidget(self.matrix_rows_spin)
        
        dim_layout.addWidget(QLabel("Cols:"))
        self.matrix_cols_spin = QSpinBox()
        self.matrix_cols_spin.setMinimum(2)
        self.matrix_cols_spin.setMaximum(20)
        self.matrix_cols_spin.setValue(2)
        dim_layout.addWidget(self.matrix_cols_spin)
        layout.addLayout(dim_layout)
        
        # Template buttons
        template_layout = QHBoxLayout()
        self.zero_sum_btn = QPushButton("Zero-Sum")
        self.diagonal_btn = QPushButton("Diagonal")
        template_layout.addWidget(self.zero_sum_btn)
        template_layout.addWidget(self.diagonal_btn)
        layout.addLayout(template_layout)
        
        # Matrix table
        self.matrix_scroll = QScrollArea()
        self.matrix_table = QTableWidget(2, 2)
        self.matrix_table.setHorizontalHeaderLabels(["C0", "C1"])
        self.matrix_table.setVerticalHeaderLabels(["R0", "R1"])
        
        for i in range(2):
            for j in range(2):
                item = QTableWidgetItem("0.0")
                item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.matrix_table.setItem(i, j, item)
        
        self.matrix_scroll.setWidget(self.matrix_table)
        layout.addWidget(self.matrix_scroll)
        
        group.setLayout(layout)
        return group
