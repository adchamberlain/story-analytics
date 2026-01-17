"""
Decomposed dashboard generation pipeline.

This module implements a three-stage pipeline for generating dashboards:
1. RequirementsAgent - Understands user intent and extracts structured specs
2. SQLAgent - Generates and validates DuckDB queries
3. LayoutAgent - Assembles the final Evidence markdown dashboard

Each agent has a focused prompt with only the context it needs,
reducing guardrail creep and improving output quality.
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
