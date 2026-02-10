import pytest
from pathlib import Path
import tempfile
import shutil
from unittest.mock import patch, MagicMock


class ProcessorTestBase:
    """Base class for processor tests with common utilities."""

    @pytest.fixture(autouse=True)
    def setup_test_environment(self, tmp_path):
        """Set up test environment with temp directories."""
        self.temp_dir = tmp_path
        self.input_dir = tmp_path / "input"
        self.output_dir = tmp_path / "output"
        self.input_dir.mkdir(parents=True)
        self.output_dir.mkdir(parents=True)

        # Create test frames
        for i in range(5):
            (self.input_dir / f"frame{i:04d}.png").touch()

        yield
