"""
Progress event system for streaming updates during dashboard generation.

This module provides a callback-based system for emitting progress updates
that can be consumed by SSE endpoints for real-time UI updates.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Callable, Any
import json


class ProgressStatus(Enum):
    """Status of a progress step."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ProgressEvent:
    """A single progress event."""
    step: str  # e.g., "requirements", "feasibility", "sql", "layout", "validation", "qa"
    status: ProgressStatus
    message: str
    details: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "status": self.status.value,
            "message": self.message,
            "details": self.details,
        }

    def to_sse(self) -> str:
        """Format as Server-Sent Event data."""
        return f"data: {json.dumps(self.to_dict())}\n\n"


# Type alias for progress callbacks
ProgressCallback = Callable[[ProgressEvent], None]


class ProgressEmitter:
    """
    Emits progress events to registered callbacks.

    Usage:
        emitter = ProgressEmitter()
        emitter.add_callback(my_callback)
        emitter.emit("sql", ProgressStatus.IN_PROGRESS, "Generating SQL queries...")
    """

    def __init__(self):
        self._callbacks: list[ProgressCallback] = []

    def add_callback(self, callback: ProgressCallback):
        """Register a callback to receive progress events."""
        self._callbacks.append(callback)

    def remove_callback(self, callback: ProgressCallback):
        """Remove a registered callback."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def emit(
        self,
        step: str,
        status: ProgressStatus,
        message: str,
        details: str | None = None
    ):
        """Emit a progress event to all registered callbacks."""
        event = ProgressEvent(
            step=step,
            status=status,
            message=message,
            details=details,
        )
        for callback in self._callbacks:
            try:
                callback(event)
            except Exception as e:
                # Don't let callback errors break the pipeline
                print(f"[Progress] Callback error: {e}")

    def emit_event(self, event: ProgressEvent):
        """Emit a pre-constructed progress event."""
        for callback in self._callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"[Progress] Callback error: {e}")


# Standard step names for consistency
STEP_REQUIREMENTS = "requirements"
STEP_FEASIBILITY = "feasibility"
STEP_SQL = "sql"
STEP_LAYOUT = "layout"
STEP_VALIDATION = "validation"
STEP_WRITING = "writing"
STEP_QA = "qa"
STEP_COMPLETE = "complete"
