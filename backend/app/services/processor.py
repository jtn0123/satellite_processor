"""Wraps the core SatelliteImageProcessor for API use"""

import sys
import threading
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Callable

# Add parent project to path so we can import the core module
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from satellite_processor.core.processor import SatelliteImageProcessor

logger = logging.getLogger(__name__)


class ProcessorService:
    """Wraps core processor, manages background processing, translates callbacks to state updates"""

    def __init__(self):
        self._active_jobs: dict = {}  # job_id -> thread

    def run_job(
        self,
        job_id: str,
        input_path: str,
        output_path: str,
        params: dict,
        on_progress: Optional[Callable] = None,
        on_status: Optional[Callable] = None,
        on_complete: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
    ):
        """Run a processing job in a background thread"""

        def _worker():
            try:
                processor = SatelliteImageProcessor(options=params)

                # Wire up callbacks
                if on_progress:
                    processor.on_progress = lambda op, pct: on_progress(job_id, op, pct)
                if on_status:
                    processor.on_status_update = lambda msg: on_status(job_id, msg)

                processor.set_input_directory(input_path)
                processor.set_output_directory(output_path)

                success = processor.process()

                if success and on_complete:
                    on_complete(job_id)
                elif not success and on_error:
                    on_error(job_id, "Processing returned False")

            except Exception as e:
                logger.error(f"Job {job_id} failed: {e}")
                if on_error:
                    on_error(job_id, str(e))
            finally:
                self._active_jobs.pop(job_id, None)

        thread = threading.Thread(target=_worker, daemon=True, name=f"job-{job_id}")
        self._active_jobs[job_id] = thread
        thread.start()

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job"""
        if job_id in self._active_jobs:
            # The thread will check self.cancelled
            return True
        return False

    def is_running(self, job_id: str) -> bool:
        thread = self._active_jobs.get(job_id)
        return thread is not None and thread.is_alive()


processor_service = ProcessorService()
