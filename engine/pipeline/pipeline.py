"""
Dashboard Generation Pipeline - Orchestrates the three-stage generation process.

Pipeline stages:
1. RequirementsAgent - Extract structured spec from user request
2. SQLAgent - Generate and validate DuckDB queries
3. LayoutAgent - Assemble Evidence markdown dashboard

This decomposed approach gives each agent focused context and clear responsibilities.
"""

from dataclasses import dataclass

from ..schema import get_schema_context
from .models import DashboardSpec, PipelineResult, ValidatedQueries
from .requirements_agent import RequirementsAgent
from .sql_agent import SQLAgent
from .layout_agent import LayoutAgent


@dataclass
class PipelineConfig:
    """Configuration for the dashboard pipeline."""
    provider_name: str | None = None
    max_sql_fix_attempts: int = 3
    verbose: bool = True


class DashboardPipeline:
    """
    Orchestrates the dashboard generation pipeline.

    The pipeline breaks dashboard creation into focused stages:
    1. Requirements extraction (understand what the user wants)
    2. SQL generation (write and validate queries)
    3. Layout assembly (create the markdown dashboard)

    Each stage has a specialized agent with focused prompts,
    reducing the cognitive load and improving output quality.
    """

    def __init__(self, config: PipelineConfig | None = None):
        self.config = config or PipelineConfig()
        self._schema_context: str | None = None

        # Initialize agents
        self.requirements_agent = RequirementsAgent(self.config.provider_name)
        self.sql_agent = SQLAgent(
            self.config.provider_name,
            max_fix_attempts=self.config.max_sql_fix_attempts,
        )
        self.layout_agent = LayoutAgent(self.config.provider_name)

    def get_schema_context(self) -> str:
        """Get cached schema context."""
        if self._schema_context is None:
            self._schema_context = get_schema_context()
        return self._schema_context

    def run(self, user_request: str) -> PipelineResult:
        """
        Run the full dashboard generation pipeline.

        Args:
            user_request: The user's natural language request

        Returns:
            PipelineResult with the generated dashboard or error
        """
        schema = self.get_schema_context()

        # Stage 1: Extract requirements
        if self.config.verbose:
            print("[Pipeline] Stage 1: Extracting requirements...")

        try:
            spec = self.requirements_agent.extract_spec(user_request, schema)
            if self.config.verbose:
                print(f"[Pipeline]   Title: {spec.title}")
                print(f"[Pipeline]   Metrics: {len(spec.metrics)}")
                print(f"[Pipeline]   Visualizations: {len(spec.visualizations)}")
        except Exception as e:
            return PipelineResult(
                success=False,
                error=f"Requirements extraction failed: {e}",
            )

        # Stage 2: Generate and validate SQL
        if self.config.verbose:
            print("[Pipeline] Stage 2: Generating SQL queries...")

        try:
            queries = self.sql_agent.generate_queries(spec, schema)
            if self.config.verbose:
                print(f"[Pipeline]   Queries: {len(queries.queries)}")
                print(f"[Pipeline]   All valid: {queries.all_valid}")
                print(f"[Pipeline]   Attempts: {queries.validation_attempts}")
        except Exception as e:
            return PipelineResult(
                success=False,
                dashboard_spec=spec,
                error=f"SQL generation failed: {e}",
            )

        # Stage 3: Assemble layout
        if self.config.verbose:
            print("[Pipeline] Stage 3: Assembling dashboard layout...")

        try:
            markdown = self.layout_agent.assemble_dashboard(spec, queries)
            if self.config.verbose:
                print(f"[Pipeline]   Markdown length: {len(markdown)} chars")
        except Exception as e:
            return PipelineResult(
                success=False,
                dashboard_spec=spec,
                validated_queries=queries,
                error=f"Layout assembly failed: {e}",
            )

        if self.config.verbose:
            print("[Pipeline] Complete!")

        return PipelineResult(
            success=True,
            dashboard_spec=spec,
            validated_queries=queries,
            markdown=markdown,
        )

    def run_from_spec(self, spec: DashboardSpec) -> PipelineResult:
        """
        Run the pipeline starting from an existing spec.

        Useful for regenerating SQL or layout without re-extracting requirements.

        Args:
            spec: An existing DashboardSpec

        Returns:
            PipelineResult with the generated dashboard or error
        """
        schema = self.get_schema_context()

        # Stage 2: Generate and validate SQL
        if self.config.verbose:
            print("[Pipeline] Stage 2: Generating SQL queries...")

        try:
            queries = self.sql_agent.generate_queries(spec, schema)
        except Exception as e:
            return PipelineResult(
                success=False,
                dashboard_spec=spec,
                error=f"SQL generation failed: {e}",
            )

        # Stage 3: Assemble layout
        if self.config.verbose:
            print("[Pipeline] Stage 3: Assembling dashboard layout...")

        try:
            markdown = self.layout_agent.assemble_dashboard(spec, queries)
        except Exception as e:
            return PipelineResult(
                success=False,
                dashboard_spec=spec,
                validated_queries=queries,
                error=f"Layout assembly failed: {e}",
            )

        return PipelineResult(
            success=True,
            dashboard_spec=spec,
            validated_queries=queries,
            markdown=markdown,
        )
