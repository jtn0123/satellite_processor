import threading  # Add threading module
from typing import Optional, Callable, List, Dict
from dataclasses import dataclass
from datetime import datetime, timedelta
import time
import shutil
from collections import deque
from PyQt6.QtCore import QObject

@dataclass
class Task:
    name: str
    total: int
    completed: int = 0
    start_time: float = 0.0
    status: str = "Pending"
    description: str = ""
    
class ProgressTracker(QObject):
    """Enhanced progress tracking with rich visual output"""
    
    COLORS = {
        'reset': '\033[0m',
        'bold': '\033[1m',
        'green': '\033[32m',
        'blue': '\033[34m',
        'yellow': '\033[33m',
        'red': '\033[31m',
        'magenta': '\033[35m',
        'cyan': '\033[36m',
        'white': '\033[37m',
        # Add gradient colors
        'green_bright': '\033[92m',
        'blue_bright': '\033[94m',
        'yellow_bright': '\033[93m',
    }
    
    SYMBOLS = {
        'pending': '○',
        'in_progress': '⋯',
        'completed': '✓',
        'error': '✗',
        'spinner': ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        'bar_start': '▕',
        'bar_end': '▏',
        'bar_fill': '█',
        'bar_empty': '░',
    }
    
    def __init__(self, on_update: Optional[Callable] = None, parent=None):
        super().__init__(parent)
        self.tasks: Dict[str, Task] = {}
        self.current_task: Optional[str] = None
        self.on_update = on_update
        self.start_time = time.time()
        self.spinner_idx = 0
        self.terminal_width = shutil.get_terminal_size().columns
        self._running = False  # Add running flag
        self.refresh_interval = 0.1  # Refresh every 0.1 seconds for smoother animation
        self.lock = threading.Lock()  # Add a lock for thread safety
        self.update_queue = deque()  # Add a queue to batch updates
        
    def start(self):
        """Start the progress tracker in a separate thread."""
        self._running = True
        self._last_status_text = ""
        self._thread = threading.Thread(target=self._update_loop, daemon=True)
        self._thread.start()

    def _update_loop(self):
        """Continuously update the spinner and progress bars."""
        while self._running:
            with self.lock:
                if self.update_queue:
                    self._last_status_text = self.update_queue.popleft()
                    if self.on_update:
                        self.on_update(self._last_status_text)
            time.sleep(self.refresh_interval)

    def stop(self):
        """Stop the progress tracker."""
        self._running = False
        if hasattr(self, '_thread'):
            self._thread.join()

        # Reset spinner index for future use
        self.spinner_idx = 0
        
    def add_task(self, name: str, total: int, description: str = "") -> None:
        """Add a new task with description"""
        self.tasks[name] = Task(name=name, total=total, description=description)
        self._update()
        
    def start_task(self, name: str) -> None:
        """Mark a task as started with visual indicator"""
        if name in self.tasks:
            self.current_task = name
            self.tasks[name].status = "In Progress"
            self.tasks[name].start_time = time.time()
            self._update()
    
    def update_task(self, name: str, completed: int) -> None:
        """Update task progress"""
        if name in self.tasks:
            self.tasks[name].completed = min(completed, self.tasks[name].total)
            self._update()

    def complete_task(self, name: str) -> None:
        """Mark task as completed"""
        if name in self.tasks:
            self.tasks[name].completed = self.tasks[name].total
            self.tasks[name].status = "Completed"
            self._update()
    
    def get_progress_text(self) -> str:
        """Generate rich progress display with proper alignment."""
        lines = []
        term_width = self.terminal_width - 2  # Adjust for borders

        # Header
        header = "Satellite Image Processing"
        lines.append("╭" + "─" * (term_width - 2) + "╮")  # Adjust borders
        lines.append(f"│ {header.center(term_width - 4)} │")
        lines.append("├" + "─" * (term_width - 2) + "┤")

        # Overall progress
        completed_tasks = sum(1 for t in self.tasks.values() if t.status == "Completed")
        total_tasks = len(self.tasks)
        elapsed = time.time() - self.start_time
        overall = f"Tasks: {completed_tasks}/{total_tasks} • Elapsed: {self._format_time(elapsed)}"
        lines.append(f"│ {overall.ljust(term_width - 4)} │")

        # Current task with animated spinner
        if self.current_task:
            task = self.tasks[self.current_task]
            self.spinner_idx = (self.spinner_idx + 1) % len(self.SYMBOLS['spinner'])
            spinner = self.SYMBOLS['spinner'][self.spinner_idx]

            progress = (task.completed / task.total * 100) if task.total > 0 else 0

            # Create progress bar
            bar_width = term_width - 20
            filled_width = int(bar_width * progress / 100)
            empty_width = bar_width - filled_width

            progress_bar = (
                f"{self.SYMBOLS['bar_start']}"
                f"{self.SYMBOLS['bar_fill'] * filled_width}"
                f"{self.SYMBOLS['bar_empty'] * empty_width}"
                f"{self.SYMBOLS['bar_end']}"
                f" {progress:5.1f}%"
            )

            lines.append("├" + "─" * (term_width - 2) + "┤")
            task_line = f"{spinner} {task.name}"
            lines.append(f"│ {task_line.ljust(term_width - 4)} │")

            if task.description:
                desc_line = f"   {task.description}"
                lines.append(f"│ {desc_line.ljust(term_width - 4)} │")

            lines.append(f"│ {progress_bar.ljust(term_width - 4)} │")

            # Time information
            task_elapsed = time.time() - task.start_time
            eta = self._estimate_eta(task)
            time_info = f"Elapsed: {self._format_time(task_elapsed)} • ETA: {eta}"
            lines.append(f"│ {time_info.ljust(term_width - 4)} │")

        # Task summary
        lines.append("├" + "─" * (term_width - 2) + "┤")
        lines.append(f"│ {'Task Status:'.ljust(term_width - 4)} │")
        for name, task in self.tasks.items():
            status_symbol = {
                "Pending": self.SYMBOLS['pending'],
                "In Progress": self.SYMBOLS['spinner'][self.spinner_idx],
                "Completed": self.SYMBOLS['completed'],
                "Error": self.SYMBOLS['error']
            }.get(task.status, "?")

            progress = (task.completed / task.total * 100) if task.total > 0 else 0
            status_line = f"{status_symbol} {name}: {progress:.1f}%"
            lines.append(f"│ {status_line.ljust(term_width - 4)} │")

        # Footer
        lines.append("╰" + "─" * (term_width - 2) + "╯")

        return '\n'.join(lines)
    
    def get_status_text(self) -> str:
        """Generate enhanced HTML progress display with color and formatting."""
        total_tasks = len(self.tasks)
        completed_tasks = sum(1 for t in self.tasks.values() if t.status == "Completed")
        elapsed = time.time() - self.start_time

        html_lines = []

        # Style definitions
        styles = '''
        <style>
            body {
                background-color: #1E1E1E;
                color: #FFFFFF;
                font-family: 'Consolas', 'Courier New', monospace;
            }
            .header {
                text-align: center;
                font-size: 20px;
                font-weight: bold;
                margin-bottom: 20px;
            }
            .section {
                margin-bottom: 20px;
            }
            .progress-bar {
                width: 100%;
                background-color: #444;
                border-radius: 5px;
                overflow: hidden;
            }
            .progress {
                height: 20px;
                background-color: #76c7c0;
                width: {progress}%;
            }
            .task-list {
                list-style-type: none;
                padding: 0;
            }
            .task {
                margin-bottom: 10px;
            }
            .task-name {
                font-weight: bold;
            }
            .completed {
                color: #4CAF50;
            }
            .pending {
                color: #FFC107;
            }
            .in-progress {
                color: #2196F3;
            }
            .error {
                color: #F44336;
            }
        </style>
        '''

        # Header
        html_lines.append('<div class="header">Satellite Image Processing</div>')

        # Overall progress
        overall_progress = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        html_lines.append('<div class="section">')
        html_lines.append(f'<div>Tasks: {completed_tasks}/{total_tasks} • Elapsed: {self._format_time(elapsed)}</div>')
        html_lines.append('<div class="progress-bar">')
        html_lines.append(f'<div class="progress" style="width: {overall_progress}%"></div>')
        html_lines.append('</div>')
        html_lines.append('</div>')

        # Current task
        if self.current_task:
            task = self.tasks[self.current_task]
            progress = (task.completed / task.total * 100) if task.total > 0 else 0
            eta = self._estimate_eta(task)

            html_lines.append('<div class="section">')
            html_lines.append(f'<div class="task-name">{task.name}</div>')
            if task.description:
                html_lines.append(f'<div>{task.description}</div>')
            html_lines.append('<div class="progress-bar">')
            html_lines.append(f'<div class="progress" style="width: {progress}%; background-color: #f7a35c;"></div>')
            html_lines.append('</div>')
            html_lines.append(f'<div>Progress: {task.completed}/{task.total} • ETA: {eta}</div>')
            html_lines.append('</div>')

        # Task list
        html_lines.append('<div class="section">')
        html_lines.append('<div>Task Status:</div>')
        html_lines.append('<ul class="task-list">')
        for task in self.tasks.values():
            status_class = {
                "Pending": "pending",
                "In Progress": "in-progress",
                "Completed": "completed",
                "Error": "error"
            }.get(task.status, "")
            progress = (task.completed / task.total * 100) if task.total > 0 else 0
            html_lines.append(f'<li class="task {status_class}">')
            html_lines.append(f'<span class="task-name">{task.name}</span>: {progress:.1f}%')
            html_lines.append('</li>')
        html_lines.append('</ul>')
        html_lines.append('</div>')

        # Combine styles and HTML content
        html_content = f'{styles}<body>{"".join(html_lines)}</body>'
        return html_content

    def _create_fancy_progress_bar(self, percent: float, width: int = 50) -> str:
        """Create a gradient progress bar"""
        filled_width = int(width * percent / 100)
        empty_width = width - filled_width
        
        # Gradient colors for filled portion
        if percent < 33:
            color = self.COLORS['red']
        elif percent < 66:
            color = self.COLORS['yellow']
        else:
            color = self.COLORS['green']
            
        bar = (
            color +
            "█" * filled_width +
            self.COLORS['reset'] +
            "░" * empty_width
        )
        
        return bar
    
    def _estimate_eta(self, task: Task) -> str:
        """Estimate time remaining for task"""
        if task.completed == 0:
            return "Calculating..."
            
        elapsed = time.time() - task.start_time
        rate = task.completed / elapsed
        remaining_items = task.total - task.completed
        
        if rate > 0:
            seconds_remaining = remaining_items / rate
            return self._format_time(seconds_remaining)
        return "Unknown"
    
    def _update(self) -> None:
        """Queue the progress update to reduce flicker."""
        if self.on_update:
            progress_text = self.get_status_text()
            self.on_update(progress_text)  # Directly call the update callback

    @staticmethod
    def _create_progress_bar(percent: float, width: int = 30) -> str:
        """Create a text-based progress bar"""
        filled = int(width * percent / 100)
        bar = "█" * filled + "░" * (width - filled)
        return bar
        
    @staticmethod
    def _format_time(seconds: float) -> str:
        """Format seconds into human-readable time"""
        if seconds < 60:
            return f"{seconds:.1f}s"
        elif seconds < 3600:
            minutes = seconds / 60
            return f"{minutes:.1f}m"
        else:
            hours = seconds / 3600
            return f"{hours:.1f}h"
