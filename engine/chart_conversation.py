"""
Chart Conversation Manager - Simplified flow for creating single charts.

This is a streamlined conversation flow that:
1. Takes a user request for a chart
2. Runs the chart pipeline to generate it
3. Creates a preview dashboard
4. Allows refinement

Much simpler than the full dashboard conversation because:
- Only ONE chart at a time
- No multi-chart planning
- Simpler state machine
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from .chart_pipeline import ChartPipeline, ChartPipelineConfig, ChartPipelineResult
from .config import get_config
from .dashboard_composer import create_chart_dashboard, get_composer
from .llm.base import Message
from .llm.claude import get_fast_provider
from .models import Chart, ValidatedChart, get_chart_storage
from .progress import ProgressEmitter, ProgressStatus
from .semantic import SemanticLayer


class ChartPhase(Enum):
    """Phases of chart creation conversation."""

    WAITING = "waiting"  # Waiting for user input
    PROPOSING = "proposing"  # Showing proposal with SQL and data preview
    GENERATING = "generating"  # Generating the chart
    VIEWING = "viewing"  # Chart is ready, user can view/refine
    COMPLETE = "complete"  # User is done


@dataclass
class ChartActionButton:
    """An action button for phase transitions."""

    id: str
    label: str
    style: str = "secondary"  # "primary" or "secondary"


@dataclass
class ChartConversationResult:
    """Result from processing a chart message."""

    response: str
    action_buttons: list[ChartActionButton] | None = None
    chart_url: str | None = None  # URL to view the chart (with ?embed=true)
    chart_id: str | None = None  # ID of the created chart
    dashboard_slug: str | None = None  # Slug of the preview dashboard
    error: str | None = None


@dataclass
class ChartConversationState:
    """Tracks state of a chart conversation."""

    phase: ChartPhase = ChartPhase.WAITING
    messages: list[Message] = field(default_factory=list)

    # Proposal state (before chart is generated)
    proposed_spec: Any | None = None  # ChartSpec from requirements extraction
    proposed_sql: str | None = None
    proposed_columns: list[str] | None = None
    proposed_data_preview: list[dict] | None = None

    # Current chart (after generation)
    current_chart: ValidatedChart | None = None
    current_chart_id: str | None = None
    dashboard_slug: str | None = None

    # Original request for refinement
    original_request: str | None = None


class ChartConversationManager:
    """
    Manages chart creation conversations.

    Simplified flow:
    1. User describes a chart
    2. We generate it
    3. Show it to user
    4. User can refine or accept
    """

    def __init__(
        self,
        provider_name: str | None = None,
        progress_emitter: ProgressEmitter | None = None,
    ):
        self.config = get_config()
        # Use fast model (Haiku) for intent classification and simple responses
        self.llm = get_fast_provider(provider_name)
        self._provider_name = provider_name
        self.state = ChartConversationState()
        self.chart_storage = get_chart_storage()
        self.composer = get_composer()
        self.progress_emitter = progress_emitter

        # Initialize chart pipeline with source_name from config
        self._pipeline = ChartPipeline(
            ChartPipelineConfig(
                provider_name=provider_name,
                verbose=True,
            ),
            source_name=self.config.source_name,
        )

        print(f"[ChartConversation] Using provider: {self.llm.name}")

    def _emit_progress(
        self,
        step: str,
        status: ProgressStatus,
        message: str,
        details: str | None = None,
    ):
        """Emit a progress event if emitter is configured."""
        if self.progress_emitter:
            self.progress_emitter.emit(step, status, message, details)

    def reset(self):
        """Reset conversation state."""
        self.state = ChartConversationState()

    def process_message(self, user_input: str) -> ChartConversationResult:
        """
        Process a user message.

        Args:
            user_input: The user's message

        Returns:
            ChartConversationResult with response and optional chart URL
        """
        # Check for action button click
        if user_input.startswith("__action:"):
            action_id = user_input[9:]
            return self._handle_action(action_id)

        # Add message to history
        self.state.messages.append(Message(role="user", content=user_input))

        # Handle based on phase
        import sys
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"[TRACE] process_message called", file=sys.stderr)
        print(f"  phase: {self.state.phase}", file=sys.stderr)
        print(f"  current_chart: {self.state.current_chart is not None}", file=sys.stderr)
        print(f"  current_chart_id: {self.state.current_chart_id}", file=sys.stderr)
        print(f"  dashboard_slug: {self.state.dashboard_slug}", file=sys.stderr)
        print(f"  input: {user_input[:50]}...", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)

        # Safety check: if we're in VIEWING phase but missing chart data, try to reload
        if self.state.phase == ChartPhase.VIEWING and self.state.current_chart_id:
            if not self.state.current_chart or not self.state.dashboard_slug:
                print(f"[TRACE] VIEWING phase but missing chart data, reloading...", file=sys.stderr)
                stored_chart = self.chart_storage.get(self.state.current_chart_id)
                if stored_chart:
                    from dataclasses import dataclass

                    @dataclass
                    class MinimalSpec:
                        chart_type: str
                        title: str
                        description: str

                    @dataclass
                    class MinimalChart:
                        sql: str
                        spec: MinimalSpec

                    self.state.current_chart = MinimalChart(
                        sql=stored_chart.sql,
                        spec=MinimalSpec(
                            chart_type=stored_chart.chart_type.value if hasattr(stored_chart.chart_type, 'value') else str(stored_chart.chart_type),
                            title=stored_chart.title,
                            description=stored_chart.description or "",
                        ),
                    )
                    self.state.dashboard_slug = self.state.current_chart_id
                    print(f"[TRACE] Reloaded chart data successfully", file=sys.stderr)
                else:
                    print(f"[TRACE] WARNING: Chart not found in storage!", file=sys.stderr)

        if self.state.phase == ChartPhase.WAITING:
            # Classify intent before assuming it's a chart request
            intent = self._classify_intent(user_input)

            if intent == "chart_request":
                return self._handle_new_chart_request(user_input)
            elif intent == "data_question":
                return self._handle_data_question(user_input)
            else:  # "unclear" or other
                return self._handle_clarification_needed(user_input)

        elif self.state.phase == ChartPhase.PROPOSING:
            # User wants to modify the proposal - regenerate with their feedback
            modified_request = f"{self.state.original_request}\n\nModification: {user_input}"
            return self._handle_new_chart_request(modified_request)

        elif self.state.phase == ChartPhase.VIEWING:
            return self._handle_refinement_request(user_input)
        else:
            # Default: treat as new chart request
            return self._handle_new_chart_request(user_input)

    def _handle_action(self, action_id: str) -> ChartConversationResult:
        """Handle action button clicks."""
        action_id = action_id.lower().strip()

        if action_id == "done":
            self.state.phase = ChartPhase.COMPLETE
            return ChartConversationResult(
                response="Chart saved! You can find it in your chart library.",
                chart_id=self.state.current_chart_id,
            )

        elif action_id == "new_chart":
            self.reset()
            return ChartConversationResult(
                response="What chart would you like to create?",
            )

        elif action_id == "modify":
            # Stay in VIEWING phase so next message triggers refinement
            return ChartConversationResult(
                response="What would you like to change about this chart?",
                chart_id=self.state.current_chart_id,
                chart_url=self.get_chart_embed_url(),
            )

        elif action_id == "add_to_dashboard":
            # Future: implement dashboard selection
            return ChartConversationResult(
                response="Dashboard composition coming soon. For now, your chart has been saved.",
                chart_id=self.state.current_chart_id,
            )

        elif action_id == "show_examples":
            response = """Here are some charts you can create:

**Time Series**
- "Show me monthly revenue over the past year"
- "User signups by week"

**Comparisons**
- "Revenue by customer segment"
- "Top 10 customers by total spend"

**KPIs**
- "Total revenue this quarter"
- "Average order value"

Just describe what you want to see!"""
            self.state.messages.append(Message(role="assistant", content=response))
            return ChartConversationResult(response=response)

        elif action_id == "show_data":
            # Delegate to the data question handler
            return self._handle_data_question("What data tables and columns are available?")

        elif action_id == "generate":
            # User approved the proposal - generate the chart
            return self._handle_generate_chart()

        elif action_id == "modify_plan":
            # User wants to modify the proposal
            return ChartConversationResult(
                response="What would you like to change about the proposed chart?",
                action_buttons=[
                    ChartActionButton(id="generate", label="Generate", style="primary"),
                    ChartActionButton(id="modify_plan", label="Modify Plan", style="secondary"),
                ],
            )

        else:
            return ChartConversationResult(
                response=f"Unknown action: {action_id}",
            )

    def _classify_intent(self, user_input: str) -> str:
        """
        Use LLM to classify user intent.

        Returns one of: "chart_request", "data_question", "unclear"
        """
        system_prompt = """You are an intent classifier for a SaaS analytics chart creation tool.

This tool creates charts from SaaS business data: customers, subscriptions, invoices, revenue, user signups, events, business metrics.

Classify the user's message into ONE of these categories:

1. "chart_request" - User wants to SEE a specific metric or visualization:
   - Questions asking for specific numbers: "What's our total revenue?", "How many customers do we have?"
   - Visualization requests: "Show me revenue by month", "Create a bar chart of sales"
   - Metric queries: "Total revenue this year", "Average order value", "Customer count"
   - Business questions: "How are we doing with revenue?", "What's our subscription growth?"

2. "data_question" - User is asking about the SYSTEM or CAPABILITIES (not asking for data):
   - "What data do you have?", "What tables are available?"
   - "Help", "What can you do?", "How does this work?"
   - Questions about the tool itself, not about business metrics

3. "unclear" - Off-topic or truly ambiguous:
   - Off-topic: weather, sports, news, jokes, general knowledge
   - Greetings: "Hello", "How are you?"
   - Too vague to interpret: "hmm", "maybe", "something"

CRITICAL DISTINCTION:
- "What's our revenue?" = chart_request (asking for a metric VALUE)
- "What data do you have?" = data_question (asking about the SYSTEM)
- "How are we doing with customers?" = chart_request (asking about business PERFORMANCE)

Respond with EXACTLY one word: chart_request, data_question, or unclear"""

        messages = [Message(role="user", content=user_input)]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0,
            max_tokens=20,
        )

        intent = response.content.strip().lower().replace('"', '').replace("'", "")

        print(f"[ChartConversation] Intent classification for '{user_input[:30]}...': {intent}")

        # Use exact matching for the expected values
        if intent == "chart_request":
            return "chart_request"
        elif intent == "data_question":
            return "data_question"
        else:
            # Default to unclear for anything else
            return "unclear"

    def _handle_data_question(self, user_input: str) -> ChartConversationResult:
        """Answer a question about the available data or system capabilities."""
        # Use pipeline's schema context which includes semantic layer
        schema_context = self._pipeline.get_schema_context()

        system_prompt = f"""You are a helpful assistant for a chart creation tool.
The user is asking about the data or system. Answer their question concisely.

AVAILABLE DATA:
{schema_context}

After answering, remind them they can describe a chart they'd like to create.
Keep your response brief and friendly."""

        messages = [Message(role="user", content=user_input)]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.3,
            max_tokens=500,
        )

        answer = response.content.strip()
        self.state.messages.append(Message(role="assistant", content=answer))

        return ChartConversationResult(
            response=answer,
        )

    def _handle_clarification_needed(self, user_input: str) -> ChartConversationResult:
        """Handle unclear input by guiding user to valid paths."""
        response = """I'm here to help you create charts! What would you like to do?"""

        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            action_buttons=[
                ChartActionButton(id="show_examples", label="Show Chart Examples", style="primary"),
                ChartActionButton(id="show_data", label="What Data Is Available?", style="secondary"),
            ],
        )

    def _handle_new_chart_request(self, user_input: str) -> ChartConversationResult:
        """Handle a request for a new chart - creates a PROPOSAL first."""
        self.state.original_request = user_input

        print(f"[ChartConversation] Creating proposal for: {user_input[:50]}...")

        # Stage 1: Extract requirements
        self._emit_progress("requirements", ProgressStatus.IN_PROGRESS, "Analyzing request...")
        schema = self._pipeline.get_schema_context()
        try:
            spec = self._pipeline.requirements_agent.extract_spec(user_input, schema)
            # Validate and correct spec
            from .validators import ChartSpecValidator
            spec = ChartSpecValidator.validate_spec(spec)
            self._emit_progress("requirements", ProgressStatus.COMPLETED, "Request analyzed")
        except Exception as e:
            print(f"[ChartConversation] Requirements extraction failed: {e}")
            self._emit_progress("requirements", ProgressStatus.FAILED, f"Failed: {e}")
            self.state.phase = ChartPhase.WAITING
            return ChartConversationResult(
                response="I couldn't understand that chart request. Could you try rephrasing it?",
                error=str(e),
                action_buttons=[
                    ChartActionButton(id="show_examples", label="Show Examples", style="primary"),
                    ChartActionButton(id="show_data", label="What Data Is Available?", style="secondary"),
                ],
            )

        # Stage 2: Generate SQL
        self._emit_progress("sql", ProgressStatus.IN_PROGRESS, "Generating SQL query...")
        try:
            query_name, sql, columns, filter_queries, error = self._pipeline.sql_agent.generate_query(spec, schema)
            if error:
                raise Exception(error)
            self._emit_progress("sql", ProgressStatus.COMPLETED, "SQL generated")
        except Exception as e:
            print(f"[ChartConversation] SQL generation failed: {e}")
            self._emit_progress("sql", ProgressStatus.FAILED, f"SQL failed: {e}")
            self.state.phase = ChartPhase.WAITING
            return ChartConversationResult(
                response=f"I couldn't generate valid SQL for that request. Error: {e}",
                error=str(e),
                action_buttons=[
                    ChartActionButton(id="show_examples", label="Show Examples", style="primary"),
                    ChartActionButton(id="show_data", label="What Data Is Available?", style="secondary"),
                ],
            )

        # Stage 3: Get data preview
        self._emit_progress("validation", ProgressStatus.IN_PROGRESS, "Validating data...")
        data_preview = []
        row_count = 0
        try:
            from .sql_validator import execute_query
            print(f"[ChartConversation] Executing preview query: {sql[:100]}...")
            result = execute_query(sql, query_name, limit=100)
            if result.error:
                print(f"[ChartConversation] Data preview query error: {result.error}")
                self._emit_progress("validation", ProgressStatus.COMPLETED, "Query validated (no preview)")
            elif result.data:
                row_count = result.row_count
                # Get first 5 rows for preview
                data_preview = result.data[:5]
                print(f"[ChartConversation] Got {row_count} rows, preview has {len(data_preview)} rows")
                self._emit_progress("validation", ProgressStatus.COMPLETED, f"Found {row_count} rows")
            else:
                print(f"[ChartConversation] Query returned no data")
                self._emit_progress("validation", ProgressStatus.COMPLETED, "Query returned no data")
        except Exception as e:
            import traceback
            print(f"[ChartConversation] Data preview failed: {e}")
            traceback.print_exc()
            self._emit_progress("validation", ProgressStatus.COMPLETED, "Query validated (no preview)")
            # Continue without preview - not a blocking error

        # Store proposal in state
        self.state.proposed_spec = spec
        self.state.proposed_sql = sql
        self.state.proposed_columns = columns
        self.state.proposed_data_preview = data_preview
        self.state.phase = ChartPhase.PROPOSING

        # Build proposal response
        response = self._build_proposal_response(spec, sql, columns, data_preview, row_count)

        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            action_buttons=[
                ChartActionButton(id="generate", label="Generate", style="primary"),
                ChartActionButton(id="modify_plan", label="Modify Plan", style="secondary"),
            ],
        )

    def _format_sql(self, sql: str) -> str:
        """Format SQL for better readability with proper line wrapping."""
        import re

        formatted = sql.strip()

        # First, normalize whitespace
        formatted = re.sub(r'\s+', ' ', formatted)

        # Add newlines before major keywords
        keywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR',
            'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
            'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN',
            'ON', 'UNION', 'WITH'
        ]

        for kw in keywords:
            # Add newline before keyword (case insensitive)
            pattern = f'(?i)\\s+({kw})\\b'
            formatted = re.sub(pattern, f'\n{kw}', formatted)

        # Handle CTE: "WITH name AS (" should put the SELECT on new line
        formatted = re.sub(r'(?i)(WITH\s+\w+\s+AS\s*\()', r'\1\n', formatted)

        # Break SELECT columns: add newline after each comma in SELECT clause
        # Find SELECT ... FROM and break on commas
        def break_select_columns(match):
            select_part = match.group(1)
            # Split by comma and rejoin with newlines
            parts = select_part.split(',')
            if len(parts) > 1:
                return 'SELECT\n  ' + ',\n  '.join(p.strip() for p in parts) + '\nFROM'
            return match.group(0)

        formatted = re.sub(
            r'(?i)SELECT\s+(.+?)\s+FROM',
            break_select_columns,
            formatted,
            flags=re.DOTALL
        )

        # Close paren should be on its own line before SELECT in CTE
        formatted = re.sub(r'\)\s*SELECT', ')\nSELECT', formatted)

        # Clean up and indent
        lines = formatted.split('\n')
        result_lines = []
        indent = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Decrease indent for lines starting with )
            if line.startswith(')'):
                indent = max(0, indent - 1)

            # Add the line with current indent
            result_lines.append('  ' * indent + line)

            # Increase indent after ( at end of line (CTE, subquery)
            if line.rstrip().endswith('('):
                indent += 1

        return '\n'.join(result_lines)

    def _build_proposal_response(
        self,
        spec,
        sql: str,
        columns: list[str],
        data_preview: list[dict],
        row_count: int,
    ) -> str:
        """Build the proposal response with SQL and data preview."""
        # Format SQL for readability
        formatted_sql = self._format_sql(sql)

        lines = [
            f"## PROPOSED CHART",
            "",
            f"**{spec.title}**",
            "",
            spec.description,
            "",
            f"**Chart Type:** {spec.chart_type.value}",
            "",
            "### SQL QUERY",
            "",
            "```sql",
            formatted_sql,
            "```",
            "",
        ]

        # Add data preview if available
        if data_preview:
            lines.extend([
                f"### DATA PREVIEW ({row_count} total rows)",
                "",
            ])

            # Build a simple text table (more reliable than markdown tables)
            headers = list(data_preview[0].keys())

            # Calculate column widths
            col_widths = {}
            for h in headers:
                col_widths[h] = len(h)
                for row in data_preview[:5]:
                    val = str(row.get(h, ""))[:20]  # Truncate long values
                    col_widths[h] = max(col_widths[h], len(val))

            # Build table using code block for fixed-width formatting
            lines.append("```")

            # Header row
            header_row = "  ".join(h.ljust(col_widths[h]) for h in headers)
            lines.append(header_row)

            # Separator
            sep_row = "  ".join("-" * col_widths[h] for h in headers)
            lines.append(sep_row)

            # Data rows
            for row in data_preview[:5]:
                values = [str(row.get(h, ""))[:20].ljust(col_widths[h]) for h in headers]
                lines.append("  ".join(values))

            lines.append("```")
            lines.append("")
        else:
            lines.extend([
                "### DATA PREVIEW",
                "",
                "_Could not generate preview - query will be validated on generation._",
                "",
            ])

        lines.extend([
            "---",
            "",
            "Click **Generate** to create the chart, or **Modify Plan** to make changes.",
        ])

        return "\n".join(lines)

    def _handle_generate_chart(self) -> ChartConversationResult:
        """Generate the chart from the approved proposal."""
        if not self.state.proposed_spec or not self.state.proposed_sql:
            return ChartConversationResult(
                response="No proposal to generate. Please describe the chart you want first.",
                error="No proposal in state",
            )

        print(f"[ChartConversation] Generating chart from proposal...")
        self.state.phase = ChartPhase.GENERATING
        self._emit_progress("layout", ProgressStatus.IN_PROGRESS, "Building chart configuration...")

        spec = self.state.proposed_spec
        sql = self.state.proposed_sql
        columns = self.state.proposed_columns or []

        # Build chart config
        config = self._pipeline._build_chart_config(spec, columns)

        # Build filters
        filter_queries = []  # We don't store these in proposal, regenerate if needed
        filters = self._pipeline._build_filters(spec, filter_queries)

        # Create validated chart
        validated_chart = ValidatedChart(
            spec=spec,
            query_name=spec.title.lower().replace(" ", "_")[:50],
            sql=sql,
            columns=columns,
            config=config,
            filters=filters,
            validation_status="valid",
        )

        self._emit_progress("layout", ProgressStatus.COMPLETED, "Chart configured")
        self._emit_progress("writing", ProgressStatus.IN_PROGRESS, "Saving chart...")

        # Store the chart
        stored_chart = Chart.from_validated(validated_chart)
        self.chart_storage.save(stored_chart)

        self.state.current_chart = validated_chart
        self.state.current_chart_id = stored_chart.id

        # Create a preview dashboard for viewing
        dashboard = create_chart_dashboard(stored_chart)
        self.state.dashboard_slug = dashboard.slug

        self._emit_progress("writing", ProgressStatus.COMPLETED, "Chart saved")

        # Run visual QA if pipeline has quality validator enabled
        qa_result = None
        if self._pipeline.quality_validator and self._pipeline.quality_validator.enable_visual_qa:
            self._emit_progress("qa", ProgressStatus.IN_PROGRESS, "Running quality check...")
            try:
                qa_result = self._pipeline.quality_validator.validate_chart(
                    validated_chart,
                    original_request=self.state.original_request or "",
                    chart_slug=f"/chart/{stored_chart.id}",
                )
                if qa_result.passed:
                    self._emit_progress("qa", ProgressStatus.COMPLETED, "Quality check passed")
                else:
                    issues = len(qa_result.critical_issues) if qa_result.critical_issues else 0
                    self._emit_progress("qa", ProgressStatus.COMPLETED, f"Quality check found {issues} issues")
            except (RuntimeError, ConnectionError, TimeoutError) as e:
                # Expected errors: QA service unavailable, network issues, timeouts
                print(f"[ChartConversation] QA validation skipped (service unavailable): {e}")
                self._emit_progress("qa", ProgressStatus.COMPLETED, "Quality check skipped")
            except Exception as e:
                # Unexpected errors: log full traceback so bugs don't hide
                import traceback
                print(f"[ChartConversation] QA validation error (unexpected): {e}")
                traceback.print_exc()
                self._emit_progress("qa", ProgressStatus.FAILED, f"Quality check error: {type(e).__name__}")

        # Build response - use /chart/{id} route for React app
        chart_url = f"{self.config.frontend_url}/chart/{stored_chart.id}"

        self.state.phase = ChartPhase.VIEWING
        self._emit_progress("complete", ProgressStatus.COMPLETED, "Chart ready!")

        # Clear proposal state
        self.state.proposed_spec = None
        self.state.proposed_sql = None
        self.state.proposed_columns = None
        self.state.proposed_data_preview = None

        response = f"""Created: **{spec.title}**

{spec.description}

View your chart at: {chart_url}

What would you like to do next?"""

        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            chart_url=chart_url,
            chart_id=stored_chart.id,
            dashboard_slug=dashboard.slug,
            action_buttons=[
                ChartActionButton(id="done", label="Done", style="primary"),
                ChartActionButton(id="modify", label="Modify", style="secondary"),
                ChartActionButton(id="new_chart", label="Create Another", style="secondary"),
            ],
        )

    def _is_visual_change(self, user_input: str) -> bool:
        """
        Use LLM to classify if a refinement request is a visual/styling change (config)
        vs a data change (SQL).
        """
        system_prompt = """You are classifying a chart modification request.

Respond with EXACTLY one word: "visual" or "data"

"visual" - Changes to appearance only (no SQL change needed):
  Colors, fonts, sizes, titles, labels, legend text, axis titles,
  show/hide elements, spacing, rotation, stacking, orientation

"data" - Changes to what data is shown (SQL change needed):
  Filters, date ranges, grouping, metrics, adding/removing columns,
  changing aggregation, sorting by data, different breakdowns"""

        messages = [Message(role="user", content=user_input)]
        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0,
            max_tokens=10,
        )

        result = response.content.strip().lower()
        is_visual = "visual" in result
        print(f"[ChartConversation] LLM classification for '{user_input[:40]}': {result} → visual={is_visual}")
        return is_visual

    def _handle_visual_change(self, user_input: str) -> ChartConversationResult:
        """Handle a visual/config-only change (colors, fonts, etc.)."""
        import json
        import sys
        from dataclasses import asdict
        from .config_loader import get_config_loader

        print(f"[ChartConversation] Handling visual change: {user_input[:50]}...")

        # Get current chart
        stored_chart = self.chart_storage.get(self.state.current_chart_id)
        if not stored_chart:
            print(f"[ChartConversation] Chart not found in storage!", file=sys.stderr)
            return ChartConversationResult(
                response="Chart not found. Please try creating a new chart.",
                error="Chart not found",
            )

        print(f"[ChartConversation] Loaded chart: {stored_chart.title}", file=sys.stderr)
        print(f"[ChartConversation] Config type: {type(stored_chart.config)}", file=sys.stderr)

        chart_type = self.state.current_chart.spec.chart_type

        # Convert ChartConfig dataclass to dict for JSON serialization
        if stored_chart.config:
            try:
                current_config = asdict(stored_chart.config)
                # Remove None values for cleaner output
                current_config = {k: v for k, v in current_config.items() if v is not None}
            except Exception as e:
                print(f"[ChartConversation] Failed to convert config to dict: {e}", file=sys.stderr)
                current_config = {}
        else:
            current_config = {}

        # Load the config edit prompt
        loader = get_config_loader()
        try:
            prompt_config = loader.get_prompt("config_edit")
            system_prompt = prompt_config.get("system", "")
        except Exception:
            system_prompt = """You are a chart configuration assistant. Given a user request, suggest config changes.
Output ONLY a raw JSON object: {"suggested_config": {...}, "explanation": "..."}

Available config options:
- color: hex color for bars/lines (e.g., "#ef4444" for red)
- title: chart title text
- xAxisTitle, yAxisTitle: axis label text
- titleFontSize: title font size in pixels (e.g., 24 for larger, 14 for smaller)
- axisFontSize: axis labels font size in pixels
- legendFontSize: legend font size in pixels
- showLegend: true/false
- showGrid: true/false
- horizontal: true/false (for bar charts)
- stacked: true/false (for bar/area charts)
- legendLabel: custom text for the legend entry (e.g., "Total Revenue")

Color mappings: blue=#3b82f6, red=#ef4444, green=#22c55e, yellow=#eab308, purple=#a855f7, orange=#f97316"""

        # Build the user message
        user_message = f"""Chart Type: {chart_type}

Current Config:
{json.dumps(current_config, indent=2)}

User Request: {user_input}

Suggest the config changes needed."""

        try:
            llm = get_fast_provider(self._provider_name)
            llm_response = llm.generate(
                messages=[Message(role="user", content=user_message)],
                system_prompt=system_prompt,
                max_tokens=500,
                temperature=0.3,
            )

            # Parse the response
            content = llm_response.content.strip()

            # Extract JSON from response
            import re
            code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', content)
            if code_block_match:
                json_str = code_block_match.group(1)
            else:
                # Try to find raw JSON
                start = content.find('{')
                if start != -1:
                    depth = 0
                    for i, char in enumerate(content[start:], start):
                        if char == '{':
                            depth += 1
                        elif char == '}':
                            depth -= 1
                            if depth == 0:
                                json_str = content[start:i+1]
                                break
                    else:
                        json_str = None
                else:
                    json_str = None

            if json_str:
                result = json.loads(json_str)
                suggested_config = result.get("suggested_config", {})
                explanation = result.get("explanation", "Applied your changes.")

                if suggested_config:
                    # Merge with existing config dict
                    new_config_dict = {**current_config, **suggested_config}

                    # Update the ChartConfig object with new values
                    # Map common LLM response keys to ChartConfig field names
                    key_mapping = {
                        'color': 'color',
                        'fillColor': 'color',
                        'fill_color': 'fill_color',
                        'backgroundColor': 'background_color',
                        'background_color': 'background_color',
                        'title': 'title',
                        'xAxisTitle': 'x_axis_title',
                        'x_axis_title': 'x_axis_title',
                        'yAxisTitle': 'y_axis_title',
                        'y_axis_title': 'y_axis_title',
                        'showLegend': 'show_legend',
                        'show_legend': 'show_legend',
                        'showGrid': 'show_grid',
                        'show_grid': 'show_grid',
                        'horizontal': 'horizontal',
                        'stacked': 'stacked',
                        # Font sizes
                        'titleFontSize': 'title_font_size',
                        'title_font_size': 'title_font_size',
                        'legendFontSize': 'legend_font_size',
                        'legend_font_size': 'legend_font_size',
                        'axisFontSize': 'axis_font_size',
                        'axis_font_size': 'axis_font_size',
                        # Other options
                        'showValues': 'show_values',
                        'show_values': 'show_values',
                        'lineWidth': 'line_width',
                        'line_width': 'line_width',
                        'markerSize': 'marker_size',
                        'marker_size': 'marker_size',
                        'legendLabel': 'legend_label',
                        'legend_label': 'legend_label',
                        'legendText': 'legend_label',
                        'legendTitle': 'legend_label',
                    }

                    print(f"[ChartConversation] LLM suggested config: {suggested_config}", file=sys.stderr)

                    # Apply suggested changes to the existing ChartConfig
                    for key, value in suggested_config.items():
                        config_key = key_mapping.get(key, key)
                        if hasattr(stored_chart.config, config_key):
                            setattr(stored_chart.config, config_key, value)

                    self.chart_storage.save(stored_chart)

                    # Update the dashboard
                    dashboard = create_chart_dashboard(stored_chart)

                    response = f"Done! {explanation}"
                    self.state.messages.append(Message(role="assistant", content=response))

                    return ChartConversationResult(
                        response=response,
                        chart_url=self.get_chart_embed_url(),
                        chart_id=stored_chart.id,
                        dashboard_slug=dashboard.slug,
                        action_buttons=[
                            ChartActionButton(id="done", label="Done", style="primary"),
                            ChartActionButton(id="modify", label="Modify", style="secondary"),
                            ChartActionButton(id="new_chart", label="Create Another", style="secondary"),
                        ],
                    )

            # If we couldn't parse config, fall back to data change handler
            return self._handle_data_change(user_input)

        except Exception as e:
            import traceback
            print(f"[ChartConversation] Visual change failed: {e}")
            traceback.print_exc()
            # Don't fall back to data change - it destroys the chart!
            # Just return an error message
            response = f"Sorry, I couldn't apply that visual change. Try being more specific (e.g., 'change the bar color to #ef4444')."
            self.state.messages.append(Message(role="assistant", content=response))
            return ChartConversationResult(
                response=response,
                chart_url=self.get_chart_embed_url(),
                chart_id=self.state.current_chart_id,
                action_buttons=[
                    ChartActionButton(id="done", label="Done", style="primary"),
                    ChartActionButton(id="modify", label="Try Again", style="secondary"),
                ],
            )

    def _handle_data_change(self, user_input: str) -> ChartConversationResult:
        """Handle a data/SQL change (filters, grouping, etc.)."""
        # Store old chart SQL for comparison
        old_sql = self.state.current_chart.sql if self.state.current_chart else None

        # Combine original request with refinement
        combined_request = f"{self.state.original_request}\n\nRefinement: {user_input}"

        print(f"[ChartConversation] Handling data change: {user_input[:50]}...")

        # Regenerate with the refinement
        result = self._pipeline.run(combined_request)

        if not result.success:
            response = f"I couldn't make that change: {result.error}\n\nTry describing it differently."
            self.state.messages.append(Message(role="assistant", content=response))
            return ChartConversationResult(
                response=response,
                error=result.error,
                chart_url=self.get_chart_embed_url(),
                chart_id=self.state.current_chart_id,
                action_buttons=[
                    ChartActionButton(id="done", label="Keep Current", style="primary"),
                    ChartActionButton(id="new_chart", label="Start Over", style="secondary"),
                ],
            )

        # Check if the chart actually changed
        chart = result.chart
        chart_changed = old_sql != chart.sql

        if not chart_changed:
            response = "The chart wasn't changed. Try being more specific about what you want to modify."
            self.state.messages.append(Message(role="assistant", content=response))
            return ChartConversationResult(
                response=response,
                chart_url=self.get_chart_embed_url(),
                chart_id=self.state.current_chart_id,
                action_buttons=[
                    ChartActionButton(id="done", label="Keep Current", style="primary"),
                    ChartActionButton(id="modify", label="Try Something Else", style="secondary"),
                ],
            )

        # Update stored chart
        stored_chart = Chart.from_validated(chart)
        stored_chart.id = self.state.current_chart_id  # Keep same ID
        self.chart_storage.save(stored_chart)

        self.state.current_chart = chart

        # Update the dashboard
        dashboard = create_chart_dashboard(stored_chart)

        response = f"Done! Updated the chart."
        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            chart_url=self.get_chart_embed_url(),
            chart_id=stored_chart.id,
            dashboard_slug=dashboard.slug,
            action_buttons=[
                ChartActionButton(id="done", label="Done", style="primary"),
                ChartActionButton(id="modify", label="Modify", style="secondary"),
                ChartActionButton(id="new_chart", label="Create Another", style="secondary"),
            ],
        )

    def _handle_refinement_request(self, user_input: str) -> ChartConversationResult:
        """Handle a refinement request for the current chart."""
        import sys
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"[TRACE] _handle_refinement_request called", file=sys.stderr)
        print(f"  current_chart is None: {self.state.current_chart is None}", file=sys.stderr)
        print(f"  current_chart_id: {self.state.current_chart_id}", file=sys.stderr)
        print(f"  dashboard_slug: {self.state.dashboard_slug}", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)

        if not self.state.current_chart or not self.state.dashboard_slug:
            print(f"[TRACE] FALLING BACK - Missing chart data!", file=sys.stderr)
            print(f"  current_chart: {self.state.current_chart}", file=sys.stderr)
            print(f"  dashboard_slug: {self.state.dashboard_slug}", file=sys.stderr)
            return self._handle_new_chart_request(user_input)

        # Classify the request: visual change (config) vs data change (SQL)
        is_visual = self._is_visual_change(user_input)
        print(f"[ChartConversation] Is visual change: {is_visual}")

        if is_visual:
            return self._handle_visual_change(user_input)
        else:
            return self._handle_data_change(user_input)

    def get_current_chart(self) -> Chart | None:
        """Get the current chart if one exists."""
        if self.state.current_chart_id:
            return self.chart_storage.get(self.state.current_chart_id)
        return None

    def get_chart_embed_url(self) -> str | None:
        """Get the embed URL for the current chart."""
        if self.state.current_chart_id:
            return f"{self.config.frontend_url}/chart/{self.state.current_chart_id}"
        return None


def create_chart_conversation(provider_name: str | None = None) -> ChartConversationManager:
    """Create a new chart conversation manager."""
    return ChartConversationManager(provider_name=provider_name)
