"""
GUI Application Entry Point

Launch with:
    python gui_app.py
"""
import sys
from PyQt5.QtWidgets import QApplication

# Import from modular src structure
from V1.gui import FPAnalyzerGUI


def main():
    """Launch the GUI application."""
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    window = FPAnalyzerGUI()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
