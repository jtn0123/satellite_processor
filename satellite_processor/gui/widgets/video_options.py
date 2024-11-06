# satellite_processor/satellite_processor/gui/widgets/video_options.py
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QComboBox, QWidget
)
from PyQt6.QtCore import Qt # type: ignore

class VideoOptionsWidget(QGroupBox):
    """Widget for video encoding options"""
    
    def __init__(self, parent: QWidget = None) -> None:
        super().__init__("Video Options", parent)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        
        # FPS Options
        fps_layout = QHBoxLayout()
        self.fps_label = QLabel("FPS:")
        self.fps_spinbox = QSpinBox()
        self.fps_spinbox.setRange(1, 60)
        self.fps_spinbox.setValue(30)
        fps_layout.addWidget(self.fps_label)
        fps_layout.addWidget(self.fps_spinbox)
        
        # Encoder Options
        encoder_layout = QHBoxLayout()
        self.encoder_label = QLabel("Encoder:")
        self.encoder_combo = QComboBox()
        self.encoder_combo.addItems([
            "H.264 (Maximum Compatibility)",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        encoder_layout.addWidget(self.encoder_label)
        encoder_layout.addWidget(self.encoder_combo)
        
        # Add layouts to main layout
        layout.addLayout(fps_layout)
        layout.addLayout(encoder_layout)
        
        self.setLayout(layout)
        
    @property
    def encoder(self):
        """Property to maintain compatibility with existing code"""
        return self.encoder_combo
        
    @property
    def fps(self):
        """Property to maintain compatibility with existing code"""
        return self.fps_spinbox