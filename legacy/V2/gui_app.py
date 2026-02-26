import sys
from PyQt5.QtWidgets import QApplication

from V1.gui import FPAnalyzerGUI


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    window = FPAnalyzerGUI()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
