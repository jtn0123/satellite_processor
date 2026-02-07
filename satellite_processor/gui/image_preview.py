# gui/image_preview.py

from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QHBoxLayout,
    QDialog,
    QGraphicsView,
    QGraphicsScene,
    QGraphicsRectItem,
)
from PyQt6.QtCore import Qt, QRectF, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap, QPen, QColor
from ..core.processor import SatelliteImageProcessor  # Fixed import path
import cv2
import numpy as np
from pathlib import Path


class CropSelectionView(QGraphicsView):
    """Interactive view for selecting crop area"""

    crop_changed = pyqtSignal(QRectF)

    def __init__(self):
        super().__init__()
        self.scene = QGraphicsScene()
        self.setScene(self.scene)

        # Initialize selection rectangle
        self.selection = QGraphicsRectItem()
        self.selection.setPen(QPen(QColor(0, 255, 0), 2))  # Green border
        self.scene.addItem(self.selection)

        # Track mouse states
        self.drawing = False
        self.start_pos = None

        # Enable mouse tracking
        self.setMouseTracking(True)

    def set_image(self, image_path):
        """Load and display image"""
        # Load image using OpenCV
        img = cv2.imread(str(image_path))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Convert to QImage and then QPixmap
        height, width, channel = img.shape
        bytes_per_line = 3 * width
        q_img = QImage(
            img.data, width, height, bytes_per_line, QImage.Format.Format_RGB888
        )
        pixmap = QPixmap.fromImage(q_img)

        # Clear scene and add new image
        self.scene.clear()
        self.scene.addPixmap(pixmap)
        self.scene.setSceneRect(0, 0, width, height)

        # Reset view
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)

        # Re-add selection rectangle
        self.selection = QGraphicsRectItem()
        self.selection.setPen(QPen(QColor(0, 255, 0), 2))
        self.scene.addItem(self.selection)

    def mousePressEvent(self, event):
        """Start drawing selection rectangle"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.drawing = True
            self.start_pos = self.mapToScene(event.pos())
            self.selection.setRect(QRectF(self.start_pos, self.start_pos))

    def mouseMoveEvent(self, event):
        """Update selection rectangle while drawing"""
        if self.drawing:
            current_pos = self.mapToScene(event.pos())
            rect = QRectF(self.start_pos, current_pos).normalized()
            self.selection.setRect(rect)
            self.crop_changed.emit(rect)

    def mouseReleaseEvent(self, event):
        """Finish drawing selection rectangle"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.drawing = False
            current_pos = self.mapToScene(event.pos())
            rect = QRectF(self.start_pos, current_pos).normalized()
            self.selection.setRect(rect)
            self.crop_changed.emit(rect)

    def resizeEvent(self, event):
        """Keep image fitted to view when resizing"""
        super().resizeEvent(event)
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)


class ImagePreviewDialog(QDialog):
    """Dialog for previewing and selecting crop area"""

    def __init__(self, image_path, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Select Crop Area")
        self.setMinimumSize(800, 600)

        # Create layout
        layout = QVBoxLayout(self)

        # Create view
        self.view = CropSelectionView()
        layout.addWidget(self.view)

        # Create info label
        self.info_label = QLabel("Click and drag to select crop area")
        layout.addWidget(self.info_label)

        # Create buttons
        button_layout = QHBoxLayout()
        self.apply_button = QPushButton("Apply Crop")
        self.apply_button.clicked.connect(self.accept)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.apply_button)
        button_layout.addWidget(self.cancel_button)
        layout.addLayout(button_layout)

        # Load image
        self.view.set_image(image_path)

        # Store crop coordinates
        self.crop_coords = None
        self.view.crop_changed.connect(self.update_crop_info)

    def update_crop_info(self, rect):
        """Update crop coordinates and info label"""
        self.crop_coords = {
            "x": int(rect.x()),
            "y": int(rect.y()),
            "width": int(rect.width()),
            "height": int(rect.height()),
        }

        self.info_label.setText(
            f"Selection: X={self.crop_coords['x']}, Y={self.crop_coords['y']}, "
            f"Width={self.crop_coords['width']}, Height={self.crop_coords['height']}"
        )

    def get_crop_coordinates(self):
        """Return the selected crop coordinates"""
        return self.crop_coords

    def some_method(self):
        # ...existing code...
        options = {
            "crop_x": self.crop_x,
            "crop_y": self.crop_y,
            "crop_width": self.crop_width,
            "crop_height": self.crop_height,
            # Add other necessary options here
        }
        processor = SatelliteImageProcessor(options=options, parent=self)
        # ...existing code...


# Usage example in main_window.py:
def show_crop_preview(self):
    """Show crop preview dialog when crop is enabled"""
    if self.crop_check.isChecked() and self.input_path.text():
        # Get first image from input directory for preview
        input_dir = Path(self.input_path.text())
        image_files = list(input_dir.glob("*.png"))

        if image_files:
            dialog = ImagePreviewDialog(image_files[0], self)
            if dialog.exec():
                coords = dialog.get_crop_coordinates()
                if coords:
                    # Update crop spinboxes with selected coordinates
                    self.crop_x.setValue(coords["x"])
                    self.crop_y.setValue(coords["y"])
                    self.crop_width.setValue(coords["width"])
                    self.crop_height.setValue(coords["height"])
