"""
Dashboard generation pipeline (legacy).

Note: This pipeline was designed for Evidence markdown generation.
The chart-first architecture now uses engine/chart_pipeline.py for
single chart generation with React rendering.

This pipeline is maintained for backwards compatibility with the
multi-chart dashboard flow, but may be deprecated in a future version.
"""

from .models import DashboardSpec, QuerySpec, ValidatedQueries, PipelineResult
from .pipeline import DashboardPipeline, PipelineConfig, FailureType, FailureDiagnosis
from .requirements_agent import RequirementsAgent
from .sql_agent import SQLAgent
from .layout_agent import LayoutAgent
from .feasibility_checker import FeasibilityChecker, FeasibilityResult

__all__ = [
    "DashboardSpec",
    "QuerySpec",
    "ValidatedQueries",
    "PipelineResult",
    "DashboardPipeline",
    "PipelineConfig",
    "FailureType",
    "FailureDiagnosis",
    "RequirementsAgent",
    "SQLAgent",
    "LayoutAgent",
    "FeasibilityChecker",
    "FeasibilityResult",
]
