"""UI styling and theming for the GUI application."""


DARK_THEME_STYLESHEET = """
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
}
QPushButton:hover {
    background-color: #656565;
}
QPushButton:pressed {
    background-color: #3a3a3a;
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
"""

# Color palette for game visualization
GAME_COLORS = [
    (51, 181, 229), (255, 152, 48), (115, 191, 105), (242, 73, 92), (179, 136, 255),
    (255, 213, 79), (77, 208, 225), (255, 110, 64), (174, 213, 129), (236, 64, 122)
]
