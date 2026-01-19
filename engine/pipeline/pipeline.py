"""
Dashboard Generation Pipeline - Orchestrates the three-stage generation process.

Pipeline stages:
1. RequirementsAgent - Extract structured spec from user request
2. SQLAgent - Generate and validate DuckDB queries
3. LayoutAgent - Assemble Evidence markdown dashboard
4. Post-assembly validation - Verify the final markdown has valid SQL

This decomposed approach gives each agent focused context and clear responsibilities.
"""

from dataclasses import dataclass
from enum import Enum

from ..schema import get_schema_context
from ..sql_validator import validate_dashboard_sql, SQLValidator
from ..progress import (
    ProgressEmitter,
    ProgressStatus,
    STEP_REQUIREMENTS,
    STEP_FEASIBILITY,
    STEP_SQL,
    STEP_LAYOUT,
    STEP_VALIDATION,
)
from .models import DashboardSpec, PipelineResult, ValidatedQueries
from .requirements_agent import RequirementsAgent
from .sql_agent import SQLAgent
from .layout_agent import LayoutAgent
from .feasibility_checker import FeasibilityChecker, FeasibilityResult


class FailureType(Enum):
    """Types of failures that can occur in the pipeline."""
    REQUIREMENTS_ERROR = "requirements_error"
    INFEASIBLE_REQUEST = "infeasible_request"  # Data doesn't exist for this request
    SQL_GENERATION_ERROR = "sql_generation_error"
    SQL_VALIDATION_ERROR = "sql_validation_error"
    LAYOUT_ERROR = "layout_error"
    POST_ASSEMBLY_SQL_ERROR = "post_assembly_sql_error"  # Layout agent rewrote SQL incorrectly
    UNKNOWN = "unknown"


@dataclass
class PipelineConfig:
    """Configuration for the dashboard pipeline."""
    provider_name: str | None = None
    max_sql_fix_attempts: int = 3
    max_layout_fix_attempts: int = 2  # For post-assembly SQL fixes
    max_orchestrator_loops: int = 3  # Total orchestrator retry loops
    check_feasibility: bool = True  # Check if data exists before generating
    verbose: bool = True
    progress_emitter: ProgressEmitter | None = None  # Optional progress callback


@dataclass
class FailureDiagnosis:
    """Diagnosis of a pipeline failure."""
    failure_type: FailureType
    error_message: str
    suggested_action: str
    context: dict | None = None


class DashboardPipeline:
    """
    Orchestrates the dashboard generation pipeline.

    The pipeline breaks dashboard creation into focused stages:
    1. Requirements extraction (understand what the user wants)
    2. SQL generation (write and validate queries)
    3. Layout assembly (create the markdown dashboard)
    4. Post-assembly validation (verify SQL in final markdown)

    Each stage has a specialized agent with focused prompts,
    reducing the cognitive load and improving output quality.

    The orchestrator can route failures back to the appropriate stage
    for intelligent retry behavior.
    """

    def __init__(self, config: PipelineConfig | None = None):
        self.config = config or PipelineConfig()
        self._schema_context: str | None = None
        self._sql_validator: SQLValidator | None = None

        # Initialize agents
        self.requirements_agent = RequirementsAgent(self.config.provider_name)
        self.feasibility_checker = FeasibilityChecker(self.config.provider_name)
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

    def _emit_progress(
        self,
        step: str,
        status: ProgressStatus,
        message: str,
        details: str | None = None
    ):
        """Emit a progress event if an emitter is configured."""
        if self.config.progress_emitter:
            self.config.progress_emitter.emit(step, status, message, details)

    def run(self, user_request: str) -> PipelineResult:
        """
        Run the full dashboard generation pipeline with orchestration.

        This method implements an intelligent orchestration loop that:
        1. Runs the pipeline stages in sequence
        2. Validates outputs at each stage
        3. Diagnoses failures and routes to appropriate agents for fixes
        4. Retries with context until success or max attempts reached

        Args:
            user_request: The user's natural language request

        Returns:
            PipelineResult with the generated dashboard or error
        """
        schema = self.get_schema_context()

        # Initialize state for orchestration
        spec: DashboardSpec | None = None
        queries: ValidatedQueries | None = None
        markdown: str | None = None

        orchestrator_attempts = 0

        while orchestrator_attempts < self.config.max_orchestrator_loops:
            orchestrator_attempts += 1

            if self.config.verbose and orchestrator_attempts > 1:
                print(f"[Orchestrator] Retry loop {orchestrator_attempts}/{self.config.max_orchestrator_loops}")

            # Stage 1: Extract requirements (only if not already done)
            if spec is None:
                if self.config.verbose:
                    print("[Pipeline] Stage 1: Extracting requirements...")
                self._emit_progress(
                    STEP_REQUIREMENTS,
                    ProgressStatus.IN_PROGRESS,
                    "Analyzing your request..."
                )

                try:
                    spec = self.requirements_agent.extract_spec(user_request, schema)
                    if self.config.verbose:
                        print(f"[Pipeline]   Title: {spec.title}")
                        print(f"[Pipeline]   Metrics: {len(spec.metrics)}")
                        print(f"[Pipeline]   Visualizations: {len(spec.visualizations)}")
                    self._emit_progress(
                        STEP_REQUIREMENTS,
                        ProgressStatus.COMPLETED,
                        "Requirements extracted",
                        f"{len(spec.metrics)} metrics, {len(spec.visualizations)} visualizations"
                    )
                except Exception as e:
                    self._emit_progress(
                        STEP_REQUIREMENTS,
                        ProgressStatus.FAILED,
                        "Failed to extract requirements",
                        str(e)
                    )
                    return PipelineResult(
                        success=False,
                        error=f"Requirements extraction failed: {e}",
                    )

                # Stage 1.5: Check feasibility (only on first attempt)
                if self.config.check_feasibility and orchestrator_attempts == 1:
                    if self.config.verbose:
                        print("[Pipeline] Stage 1.5: Checking data feasibility...")
                    self._emit_progress(
                        STEP_FEASIBILITY,
                        ProgressStatus.IN_PROGRESS,
                        "Checking data availability..."
                    )

                    try:
                        feasibility = self.feasibility_checker.check(spec, schema)

                        if not feasibility.feasible:
                            # Completely infeasible - return early with explanation
                            if self.config.verbose:
                                print("[Pipeline]   NOT FEASIBLE - no data available for this request")
                            self._emit_progress(
                                STEP_FEASIBILITY,
                                ProgressStatus.FAILED,
                                "Required data not available",
                                feasibility.explanation
                            )
                            return PipelineResult(
                                success=False,
                                dashboard_spec=spec,
                                error=f"Cannot build this dashboard: {feasibility.explanation}",
                                feasibility_result=feasibility,
                            )

                        if not feasibility.fully_feasible:
                            # Partially feasible - log and continue with what we can do
                            if self.config.verbose:
                                print("[Pipeline]   PARTIALLY FEASIBLE:")
                                print(f"[Pipeline]     Can build: {', '.join(feasibility.feasible_parts[:3])}")
                                print(f"[Pipeline]     Cannot build: {', '.join(feasibility.infeasible_parts[:3])}")
                            # Store feasibility result for later reporting
                            spec.feasibility_result = feasibility
                            self._emit_progress(
                                STEP_FEASIBILITY,
                                ProgressStatus.COMPLETED,
                                "Partially feasible",
                                f"Can build {len(feasibility.feasible_parts)} of {len(feasibility.feasible_parts) + len(feasibility.infeasible_parts)} items"
                            )
                        else:
                            if self.config.verbose:
                                print("[Pipeline]   Fully feasible!")
                            self._emit_progress(
                                STEP_FEASIBILITY,
                                ProgressStatus.COMPLETED,
                                "Data available"
                            )

                    except Exception as e:
                        if self.config.verbose:
                            print(f"[Pipeline]   Feasibility check failed (continuing anyway): {e}")
                        self._emit_progress(
                            STEP_FEASIBILITY,
                            ProgressStatus.COMPLETED,
                            "Feasibility check skipped"
                        )

            # Stage 2: Generate and validate SQL (only if not already done)
            if queries is None or not queries.all_valid:
                if self.config.verbose:
                    print("[Pipeline] Stage 2: Generating SQL queries...")
                self._emit_progress(
                    STEP_SQL,
                    ProgressStatus.IN_PROGRESS,
                    "Generating SQL queries..."
                )

                try:
                    queries = self.sql_agent.generate_queries(spec, schema)
                    if self.config.verbose:
                        print(f"[Pipeline]   Queries: {len(queries.queries)}")
                        print(f"[Pipeline]   All valid: {queries.all_valid}")
                        print(f"[Pipeline]   Attempts: {queries.validation_attempts}")

                    if not queries.all_valid:
                        # SQL agent couldn't fix the queries
                        diagnosis = self._diagnose_failure(
                            FailureType.SQL_VALIDATION_ERROR,
                            "SQL queries failed validation after max attempts",
                            queries=queries
                        )
                        if self.config.verbose:
                            print(f"[Orchestrator] {diagnosis.suggested_action}")
                        self._emit_progress(
                            STEP_SQL,
                            ProgressStatus.IN_PROGRESS,
                            "Retrying SQL generation..."
                        )
                        # Reset queries to retry
                        queries = None
                        continue

                    self._emit_progress(
                        STEP_SQL,
                        ProgressStatus.COMPLETED,
                        "SQL queries validated",
                        f"{len(queries.queries)} queries"
                    )

                except Exception as e:
                    self._emit_progress(
                        STEP_SQL,
                        ProgressStatus.FAILED,
                        "SQL generation failed",
                        str(e)
                    )
                    return PipelineResult(
                        success=False,
                        dashboard_spec=spec,
                        error=f"SQL generation failed: {e}",
                    )

            # Stage 3: Assemble layout
            if self.config.verbose:
                print("[Pipeline] Stage 3: Assembling dashboard layout...")
            self._emit_progress(
                STEP_LAYOUT,
                ProgressStatus.IN_PROGRESS,
                "Building dashboard layout..."
            )

            try:
                markdown = self.layout_agent.assemble_dashboard(spec, queries)
                if self.config.verbose:
                    print(f"[Pipeline]   Markdown length: {len(markdown)} chars")
                self._emit_progress(
                    STEP_LAYOUT,
                    ProgressStatus.COMPLETED,
                    "Layout assembled"
                )
            except Exception as e:
                self._emit_progress(
                    STEP_LAYOUT,
                    ProgressStatus.FAILED,
                    "Layout assembly failed",
                    str(e)
                )
                return PipelineResult(
                    success=False,
                    dashboard_spec=spec,
                    validated_queries=queries,
                    error=f"Layout assembly failed: {e}",
                )

            # Stage 4: Post-assembly SQL validation
            if self.config.verbose:
                print("[Pipeline] Stage 4: Validating assembled SQL...")
            self._emit_progress(
                STEP_VALIDATION,
                ProgressStatus.IN_PROGRESS,
                "Validating dashboard..."
            )

            validation = validate_dashboard_sql(markdown)

            if validation.valid:
                if self.config.verbose:
                    print("[Pipeline]   All SQL valid in final markdown!")
                    print("[Pipeline] Complete!")
                self._emit_progress(
                    STEP_VALIDATION,
                    ProgressStatus.COMPLETED,
                    "Dashboard validated"
                )

                return PipelineResult(
                    success=True,
                    dashboard_spec=spec,
                    validated_queries=queries,
                    markdown=markdown,
                )

            # Post-assembly validation failed - Layout agent likely rewrote SQL or has reference errors
            if self.config.verbose:
                if validation.error_count > 0:
                    print(f"[Pipeline]   Post-assembly validation FAILED: {validation.error_count} SQL error(s)")
                    for err in validation.errors:
                        print(f"[Pipeline]     - {err.query_name}: {err.error[:80]}...")
                if validation.reference_mismatches:
                    print(f"[Pipeline]   Post-assembly validation FAILED: {len(validation.reference_mismatches)} reference error(s)")
                    for mismatch in validation.reference_mismatches:
                        suggestion = f" (try '{mismatch.suggestion}')" if mismatch.suggestion else ""
                        print(f"[Pipeline]     - <{mismatch.component_type}> references undefined '{mismatch.referenced_name}'{suggestion}")

            # Diagnose and decide what to do
            diagnosis = self._diagnose_post_assembly_failure(validation, queries)
            if self.config.verbose:
                print(f"[Orchestrator] Diagnosis: {diagnosis.failure_type.value}")
                print(f"[Orchestrator] Action: {diagnosis.suggested_action}")

            # Route to appropriate fix strategy
            if diagnosis.failure_type == FailureType.POST_ASSEMBLY_SQL_ERROR:
                # Layout agent rewrote SQL - try to fix with stricter instructions
                markdown = self._fix_layout_sql(spec, queries, markdown, validation)
                if markdown:
                    # Re-validate
                    revalidation = validate_dashboard_sql(markdown)
                    if revalidation.valid:
                        if self.config.verbose:
                            print("[Pipeline] Complete (after layout fix)!")
                        return PipelineResult(
                            success=True,
                            dashboard_spec=spec,
                            validated_queries=queries,
                            markdown=markdown,
                        )
                    else:
                        if self.config.verbose:
                            print("[Orchestrator] Layout fix didn't resolve SQL errors, regenerating SQL...")
                        # Reset queries to regenerate from SQL agent
                        queries = None
                        continue

            elif diagnosis.failure_type == FailureType.SQL_GENERATION_ERROR:
                # SQL itself is problematic - regenerate
                if self.config.verbose:
                    print("[Orchestrator] Routing back to SQL Agent...")
                queries = None
                continue

        # Max attempts reached
        return PipelineResult(
            success=False,
            dashboard_spec=spec,
            validated_queries=queries,
            markdown=markdown,
            error=f"Pipeline failed after {orchestrator_attempts} orchestrator loops. Last error: SQL validation failed.",
        )

    def _diagnose_failure(
        self,
        failure_type: FailureType,
        error_message: str,
        **context
    ) -> FailureDiagnosis:
        """Diagnose a pipeline failure and suggest an action."""
        suggested_actions = {
            FailureType.REQUIREMENTS_ERROR: "Review user request for clarity",
            FailureType.SQL_GENERATION_ERROR: "Regenerate SQL with additional context",
            FailureType.SQL_VALIDATION_ERROR: "Fix SQL syntax using DuckDB dialect rules",
            FailureType.LAYOUT_ERROR: "Regenerate layout with validated queries",
            FailureType.POST_ASSEMBLY_SQL_ERROR: "Fix layout SQL or regenerate from validated queries",
            FailureType.UNKNOWN: "Retry with fresh state",
        }

        return FailureDiagnosis(
            failure_type=failure_type,
            error_message=error_message,
            suggested_action=suggested_actions.get(failure_type, "Retry"),
            context=context if context else None,
        )

    def _diagnose_post_assembly_failure(
        self,
        validation,
        queries: ValidatedQueries
    ) -> FailureDiagnosis:
        """
        Diagnose why post-assembly validation failed.

        This compares the validated queries with what's in the markdown
        to determine if the Layout Agent rewrote the SQL or used wrong references.
        """
        # Check for reference mismatches (component references undefined query)
        # This is a layout agent issue - it used a query name that doesn't exist
        if validation.reference_mismatches:
            return FailureDiagnosis(
                failure_type=FailureType.POST_ASSEMBLY_SQL_ERROR,
                error_message="Layout agent used undefined query references in components",
                suggested_action="Regenerate layout with correct query references",
                context={
                    "reference_errors": [
                        f"<{m.component_type}> references '{m.referenced_name}' but should use '{m.suggestion}'"
                        if m.suggestion else f"<{m.component_type}> references undefined '{m.referenced_name}'"
                        for m in validation.reference_mismatches
                    ],
                    "defined_queries": validation.reference_mismatches[0].defined_queries if validation.reference_mismatches else [],
                },
            )

        # Check if the errors are syntax errors (Layout Agent rewrote SQL)
        syntax_error_keywords = [
            "syntax error", "parser error", "no such function",
            "wrong number of arguments", "does not exist",
            "binder error", "catalog error"
        ]

        has_syntax_errors = any(
            any(kw in err.error.lower() for kw in syntax_error_keywords)
            for err in validation.errors
        )

        if has_syntax_errors:
            return FailureDiagnosis(
                failure_type=FailureType.POST_ASSEMBLY_SQL_ERROR,
                error_message="Layout agent appears to have rewritten SQL incorrectly",
                suggested_action="Regenerate layout with strict SQL preservation",
                context={"validation_errors": [e.error for e in validation.errors]},
            )

        # Otherwise, might be a data issue or other problem
        return FailureDiagnosis(
            failure_type=FailureType.SQL_GENERATION_ERROR,
            error_message="SQL errors in final markdown",
            suggested_action="Regenerate SQL queries",
            context={"validation_errors": [e.error for e in validation.errors]},
        )

    def _fix_layout_sql(
        self,
        spec: DashboardSpec,
        queries: ValidatedQueries,
        markdown: str,
        validation
    ) -> str | None:
        """
        Attempt to fix SQL in the layout by asking Layout Agent to strictly
        preserve the validated SQL.
        """
        if self.config.verbose:
            print("[Orchestrator] Attempting to fix layout SQL...")

        # Build a more forceful prompt
        fix_prompt = f"""The dashboard you generated has errors that must be fixed.

ERRORS FOUND:
{validation.format_errors()}

YOU MUST USE THE EXACT SQL FROM THE VALIDATED QUERIES:

{queries.to_prompt_context()}

CRITICAL INSTRUCTIONS:
1. Copy the SQL EXACTLY as shown above - character for character
2. In components, use data={{query_name}} where query_name EXACTLY matches the name after ```sql
   - If the query is ```sql active_subscriptions, use data={{active_subscriptions}}
   - Do NOT use different names like total_active_subscriptions or subscription_count
3. Do NOT use DATE(DATE('now'), ...) - that's SQLite syntax, not DuckDB
4. Do NOT rewrite, optimize, or "improve" the SQL in any way
5. The SQL has already been validated and works - just use it exactly

IMPORTANT: The query name in ```sql query_name MUST MATCH the data={{query_name}} in components!

Regenerate the dashboard markdown using the EXACT SQL and query names from above.
Output ONLY the markdown, starting with # {spec.title}
"""

        from ..llm.base import Message

        messages = [Message(role="user", content=fix_prompt)]

        try:
            response = self.layout_agent.llm.generate(
                messages=messages,
                system_prompt=self.layout_agent._build_system_prompt(),
                temperature=0.1,  # Very low temperature for exact reproduction
                max_tokens=4096,
            )

            fixed_markdown = self.layout_agent._clean_markdown(response.content)

            if self.config.verbose:
                print(f"[Orchestrator] Layout fix generated ({len(fixed_markdown)} chars)")

            return fixed_markdown

        except Exception as e:
            if self.config.verbose:
                print(f"[Orchestrator] Layout fix failed: {e}")
            return None

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

        # Stage 4: Post-assembly validation
        validation = validate_dashboard_sql(markdown)
        if not validation.valid:
            if self.config.verbose:
                print(f"[Pipeline] Post-assembly validation failed: {validation.error_count} errors")

            # Attempt fix
            fixed_markdown = self._fix_layout_sql(spec, queries, markdown, validation)
            if fixed_markdown:
                revalidation = validate_dashboard_sql(fixed_markdown)
                if revalidation.valid:
                    markdown = fixed_markdown
                else:
                    return PipelineResult(
                        success=False,
                        dashboard_spec=spec,
                        validated_queries=queries,
                        markdown=markdown,
                        error=f"SQL validation failed after fix attempt: {revalidation.format_errors()}",
                    )
            else:
                return PipelineResult(
                    success=False,
                    dashboard_spec=spec,
                    validated_queries=queries,
                    markdown=markdown,
                    error=f"Post-assembly SQL validation failed: {validation.format_errors()}",
                )

        return PipelineResult(
            success=True,
            dashboard_spec=spec,
            validated_queries=queries,
            markdown=markdown,
        )
