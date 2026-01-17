"""
Conversation manager for dashboard creation and editing.

Orchestrates the multi-phase conversation flow between user and LLM.
Uses the pipeline architecture with intelligent orchestration for
dashboard generation.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from .config import get_config
from .config_loader import get_config_loader
from .generator import create_dashboard_from_markdown
from .llm.base import Message
from .llm.claude import get_provider
from .parser import DashboardParser
from .pipeline import DashboardPipeline, PipelineConfig
from .qa import DashboardQA, QAResult, run_qa_with_auto_fix
from .schema import get_schema_context


class ConversationPhase(Enum):
    """Phases of the dashboard creation conversation."""

    INTENT = "intent"  # Determine create vs edit
    CONTEXT = "context"  # What decision should this help make?
    GENERATION = "generation"  # Generate the dashboard
    REFINEMENT = "refinement"  # Iterate on feedback


@dataclass
class ClarifyingOption:
    """A single clarifying question option."""

    label: str
    value: str


@dataclass
class ConversationResult:
    """Result from processing a message."""

    response: str
    clarifying_options: list[ClarifyingOption] | None = None


@dataclass
class ConversationState:
    """Tracks the state of a conversation."""

    phase: ConversationPhase = ConversationPhase.INTENT
    messages: list[Message] = field(default_factory=list)
    intent: str | None = None  # "create" or "edit"
    target_dashboard: str | None = None  # For edit mode
    dashboard_title: str | None = None
    generated_markdown: str | None = None
    created_file: Path | None = None
    original_request: str | None = None  # Store original request for QA

    # Pipeline mode state
    dashboard_spec: Any | None = None  # DashboardSpec from pipeline
    validated_queries: Any | None = None  # ValidatedQueries from pipeline


class ConversationManager:
    """Manages the conversation flow for dashboard creation/editing."""

    def __init__(self, provider_name: str | None = None):
        self.config = get_config()
        self.config_loader = get_config_loader()
        self.llm = get_provider(provider_name)
        self._provider_name = provider_name  # Store for QA to use the same provider
        self.parser = DashboardParser()
        self.state = ConversationState()
        self._schema_context: str | None = None
        self._default_source = "snowflake_saas"  # TODO: make configurable

        # Initialize the pipeline with orchestration
        self._pipeline = DashboardPipeline(PipelineConfig(
            provider_name=provider_name,
            verbose=True,
        ))

        print(f"[LLM] Using provider: {self.llm.name}, model: {self.llm.model}")
        print(f"[Mode] Generation mode: pipeline")

    def reset(self):
        """Reset conversation state."""
        self.state = ConversationState()

    def get_schema_context(self) -> str:
        """Get cached schema context."""
        if self._schema_context is None:
            self._schema_context = get_schema_context()
        return self._schema_context

    def _is_vague_input(self, user_input: str) -> bool:
        """Check if the user input is vague (below word threshold)."""
        if not self.config_loader.is_clarifying_enabled():
            return False

        threshold = self.config_loader.get_vague_threshold()
        word_count = len(user_input.split())
        return word_count < threshold

    def _should_ask_clarifying(self) -> bool:
        """Check if we're in a phase where clarifying questions are allowed."""
        if not self.config_loader.is_clarifying_enabled():
            return False

        allowed_phases = self.config_loader.get_clarifying_phases()
        return self.state.phase.value in allowed_phases

    def _parse_clarifying_options(self, response: str) -> tuple[str, list[ClarifyingOption] | None]:
        """
        Parse clarifying question and options from LLM response.

        Expected format:
        [CLARIFYING_QUESTION]
        Question text here?
        [OPTIONS]
        - Option 1
        - Option 2
        [/CLARIFYING_QUESTION]

        Returns:
            Tuple of (cleaned response, list of options or None)
        """
        import re

        # Check if response contains clarifying question markup
        pattern = r'\[CLARIFYING_QUESTION\](.*?)\[OPTIONS\](.*?)\[/CLARIFYING_QUESTION\]'
        match = re.search(pattern, response, re.DOTALL)

        if not match:
            return response, None

        question_text = match.group(1).strip()
        options_text = match.group(2).strip()

        # Parse options (lines starting with -)
        options = []
        for line in options_text.split('\n'):
            line = line.strip()
            if line.startswith('- '):
                option_text = line[2:].strip()
                if option_text:
                    options.append(ClarifyingOption(
                        label=option_text,
                        value=option_text
                    ))

        # Clean the response - remove the markup and keep the question
        cleaned_response = response[:match.start()] + question_text + response[match.end():]
        cleaned_response = cleaned_response.strip()

        return cleaned_response, options if options else None

    def get_full_user_request(self) -> str:
        """
        Build a comprehensive user request from all user messages.

        This is used for QA validation to ensure we capture the full intent,
        not just the first message which might be vague like "create a dashboard".
        """
        # Collect all substantive user messages (exclude simple confirmations)
        simple_phrases = {"create", "generate", "build it", "looks good", "yes", "ok", "okay"}
        user_messages = []

        for msg in self.state.messages:
            if msg.role == "user":
                content = msg.content.strip().lower()
                # Skip simple confirmation messages and generation prompts
                if content not in simple_phrases and not content.startswith("based on our conversation"):
                    # Skip internal prompts we add
                    if not any(phrase in content for phrase in [
                        "generate the exact dashboard",
                        "critical error:",
                        "sql errors that must be fixed",
                    ]):
                        user_messages.append(msg.content)

        # Return the most detailed message, or combine if multiple substantive ones
        if not user_messages:
            return self.state.original_request or ""

        # Filter to substantive messages (more than a few words)
        substantive = [m for m in user_messages if len(m.split()) > 5]
        if substantive:
            # Return the longest/most detailed one
            return max(substantive, key=len)

        return self.state.original_request or user_messages[0] if user_messages else ""

    def get_system_prompt(self, include_clarifying: bool = False) -> str:
        """Get the appropriate system prompt for current phase."""
        # Build base prompt from config
        base_prompt = self.config_loader.get_base_prompt()

        # Add schema context
        schema = self.get_schema_context()
        base_prompt += f"\n\nDATABASE SCHEMA:\n{schema}"

        # Add SQL dialect rules
        dialect_prompt = self.config_loader.get_dialect_prompt(self._default_source)
        if dialect_prompt:
            base_prompt += f"\n\n{dialect_prompt}"

        # Add component documentation
        components_prompt = self.config_loader.get_components_prompt()
        base_prompt += f"\n\n{components_prompt}"

        # Add clarifying question instructions if needed
        if include_clarifying and self._should_ask_clarifying():
            clarifying_prompt = self.config_loader.get_clarifying_prompt()
            base_prompt += f"\n\n{clarifying_prompt}"

        # Add phase-specific prompt
        if self.state.intent == "edit" and self.state.target_dashboard:
            # Load dashboard content for edit mode
            dashboards = self.parser.list_dashboards()
            for dash_path in dashboards:
                if dash_path.stem == self.state.target_dashboard:
                    content = dash_path.read_text()
                    edit_prompt = self.config_loader.get_edit_prompt(content)
                    return base_prompt + "\n\n" + edit_prompt

        if self.state.phase == ConversationPhase.GENERATION:
            return base_prompt + "\n\n" + self.config_loader.get_generate_prompt()

        return base_prompt + "\n\n" + self.config_loader.get_create_prompt()

    def process_message(self, user_input: str) -> ConversationResult:
        """
        Process a user message and return the assistant's response.

        Args:
            user_input: The user's message.

        Returns:
            ConversationResult with response and optional clarifying options.
        """
        # Add user message to history
        self.state.messages.append(Message(role="user", content=user_input))

        # Handle based on current phase
        if self.state.phase == ConversationPhase.INTENT:
            response = self._handle_intent_phase(user_input)
        elif self.state.phase == ConversationPhase.GENERATION:
            response = self._handle_generation_phase(user_input)
        elif self.state.phase == ConversationPhase.REFINEMENT:
            response = self._handle_refinement_phase(user_input)
        else:
            response = self._handle_conversation_phase(user_input)

        # Parse any clarifying options from the response
        cleaned_response, clarifying_options = self._parse_clarifying_options(response)

        return ConversationResult(
            response=cleaned_response,
            clarifying_options=clarifying_options
        )

    def _handle_intent_phase(self, user_input: str) -> str:
        """Determine if user wants to create or edit."""
        lower_input = user_input.lower()

        # Check for edit intent - must be explicit edit phrases, not just the word appearing anywhere
        # e.g., "edit the dashboard" or "modify my report" but NOT "show MRR changes"
        edit_phrases = [
            "edit ", "edit the", "edit my", "edit this",
            "modify ", "modify the", "modify my", "modify this",
            "update ", "update the", "update my", "update this",
            "change the", "change my", "change this",
            "fix the", "fix my", "fix this",
        ]
        if any(phrase in lower_input for phrase in edit_phrases):
            self.state.intent = "edit"
            dashboards = self.parser.get_dashboard_summaries()

            if not dashboards:
                self.state.intent = "create"
                self.state.phase = ConversationPhase.CONTEXT
                response = "No existing dashboards found. Let's create a new one!\n\nWhat kind of dashboard would you like to create? What decisions should it help you make?"
            else:
                # List available dashboards
                dash_list = "\n".join(
                    f"  - {d['title']} ({d['file']})" for d in dashboards
                )
                response = f"Which dashboard would you like to edit?\n\n{dash_list}"

            self.state.messages.append(Message(role="assistant", content=response))
            return response

        # Check for explicit create intent or treat as create by default
        self.state.intent = "create"
        self.state.phase = ConversationPhase.CONTEXT
        self.state.original_request = user_input  # Save for QA

        # If the message contains dashboard topic, pass it to LLM
        if len(user_input.split()) > 3:  # More than just "create dashboard"
            return self._handle_conversation_phase(user_input)

        response = "Great! Let's create a new dashboard.\n\nWhat kind of dashboard would you like to create? What business decisions should it help you make?"
        self.state.messages.append(Message(role="assistant", content=response))
        return response

    def _handle_conversation_phase(self, user_input: str) -> str:
        """Handle general conversation with LLM."""
        # Check if user wants to generate
        lower_input = user_input.lower().strip()
        if any(
            phrase in lower_input
            for phrase in ["generate", "create it", "build it", "looks good", "that's it", "let's do it", "do it"]
        ) or lower_input == "create":
            self.state.phase = ConversationPhase.GENERATION
            return self._generate_dashboard()

        # Update original_request if user provides more detailed info
        if len(user_input.split()) > 5 and not self.state.original_request:
            self.state.original_request = user_input
        elif len(user_input.split()) > 10:
            # If user provides a longer, more detailed request, update it
            self.state.original_request = user_input

        # Determine if we should include clarifying question instructions
        include_clarifying = self._is_vague_input(user_input) and self._should_ask_clarifying()

        # Regular conversation - send to LLM
        response = self.llm.generate(
            messages=self.state.messages,
            system_prompt=self.get_system_prompt(include_clarifying=include_clarifying),
            temperature=0.7,
        )

        content = response.content

        # Post-process: if response contains code blocks (a proposal), ensure proper messaging
        if "```sql" in content or "<BarChart" in content or "<LineChart" in content:
            content = self._fix_proposal_messaging(content)

        self.state.messages.append(Message(role="assistant", content=content))
        return content

    def _fix_proposal_messaging(self, content: str) -> str:
        """Ensure proposal responses have correct messaging."""
        # Remove misleading phrases
        misleading = [
            "DASHBOARD CREATED", "Dashboard created", "dashboard created",
            "I've created", "I have created", "is now live", "is live",
            "Your dashboard is ready", "Here's your dashboard",
        ]
        for phrase in misleading:
            content = content.replace(phrase, "PROPOSED DASHBOARD")

        # Ensure call-to-action is present
        call_to_action = "\n\n→ Type 'create' to generate this dashboard, or tell me what you'd like to change."
        if "Type 'create'" not in content:
            content = content.rstrip() + call_to_action

        return content

    def _handle_generation_phase(self, user_input: str) -> str:
        """Generate the dashboard."""
        return self._generate_dashboard()

    def _generate_dashboard(self) -> str:
        """Generate the dashboard using the pipeline with orchestration."""
        # Get the original request from conversation
        user_request = self.state.original_request or ""

        # If no original request, try to extract from messages
        if not user_request:
            for msg in self.state.messages:
                if msg.role == "user":
                    user_request = msg.content
                    break

        print(f"[Pipeline] Starting generation for: {user_request[:100]}...")

        # Run the pipeline (includes orchestration and validation)
        result = self._pipeline.run(user_request)

        if not result.success:
            # Check if this is a feasibility issue
            if result.feasibility_result and not result.feasibility_result.feasible:
                error_msg = self._format_infeasibility_message(result.feasibility_result)
            elif result.feasibility_result and not result.feasibility_result.fully_feasible:
                # Partially feasible - pipeline still failed for other reasons
                error_msg = f"Pipeline failed: {result.error}\n\n"
                error_msg += self._format_partial_feasibility_message(result.feasibility_result)
            else:
                error_msg = f"Pipeline failed: {result.error}"

            print(f"[Pipeline] {error_msg[:200]}...")
            self.state.messages.append(Message(role="assistant", content=error_msg))
            return error_msg

        # Store pipeline results in state
        self.state.dashboard_spec = result.dashboard_spec
        self.state.validated_queries = result.validated_queries
        markdown = result.markdown

        self.state.generated_markdown = markdown

        # Extract title for filename
        title_match = markdown.split("\n")[0]
        if title_match.startswith("#"):
            title = title_match.lstrip("#").strip()
        else:
            title = result.dashboard_spec.title if result.dashboard_spec else "generated-dashboard"

        self.state.dashboard_title = title

        # Write the dashboard and run QA
        return self._finalize_dashboard(markdown, title)

    def _finalize_dashboard(self, markdown: str, title: str) -> str:
        """Write dashboard to file and run QA validation."""
        try:
            file_path = create_dashboard_from_markdown(markdown, title)
            self.state.created_file = file_path
            self.state.phase = ConversationPhase.REFINEMENT

            slug = file_path.parent.name
            url = f"{self.config.dev_url}/{slug}"

            # Run QA validation with auto-fix loop (if enabled)
            qa_result = None
            qa_run = None
            auto_fix_attempted = False
            successfully_fixed = []

            # Use the full user request for better QA context
            qa_request = self.get_full_user_request()

            if self.config_loader.is_qa_enabled() and qa_request:
                max_fix_attempts = self.config_loader.get_max_auto_fix_attempts()
                should_auto_fix = self.config_loader.should_auto_fix_critical()

                if should_auto_fix:
                    qa_run = run_qa_with_auto_fix(
                        dashboard_slug=slug,
                        file_path=file_path,
                        original_request=qa_request,
                        max_fix_attempts=max_fix_attempts,
                        schema_context=self.get_schema_context(),
                        provider_name=self._provider_name,
                    )
                    qa_result = qa_run.final_result
                    auto_fix_attempted = qa_run.auto_fix_attempted
                    successfully_fixed = qa_run.issues_fixed

                    if auto_fix_attempted:
                        self.state.generated_markdown = file_path.read_text()
                else:
                    qa_result = self._run_qa_validation(slug)

            dashboard_is_broken = qa_result and qa_result.critical_issues

            if dashboard_is_broken:
                result = f"""⚠️ Dashboard created but has issues: {slug}

View it at: {url}

Here's what I created:
{self._summarize_markdown(self.state.generated_markdown)}
"""
            else:
                result = f"""✓ Dashboard created: {slug}

View it at: {url}

Here's what I created:
{self._summarize_markdown(self.state.generated_markdown)}
"""

            if qa_result:
                result += self._format_qa_result(
                    qa_result,
                    auto_fix_attempted=auto_fix_attempted,
                    fixed_issues=successfully_fixed
                )

            if dashboard_is_broken:
                result += "\nPlease tell me how to fix these issues, or describe what you want to see."
            elif qa_result and qa_result.suggestions:
                result += "\nWould you like me to implement any of these suggestions? Or tell me what else to change."
            else:
                result += "\nWhat would you like to change?"

        except Exception as e:
            result = f"Error creating dashboard: {e}\n\nHere's the markdown I generated:\n{markdown[:500]}..."

        self.state.messages.append(Message(role="assistant", content=result))
        return result

    def _handle_refinement_phase(self, user_input: str) -> str:
        """Handle refinement requests after initial generation."""
        lower_input = user_input.lower().strip()

        # Check if user wants to create a NEW dashboard (not edit current one)
        # Must be explicit phrases - not just "new" anywhere (e.g., "remove New MRR")
        new_dashboard_phrases = [
            "create a new",
            "new dashboard",
            "different dashboard",
            "another dashboard",
            "start over",
            "start fresh",
            "begin again",
        ]
        if any(phrase in lower_input for phrase in new_dashboard_phrases) or lower_input == "new":
            self.reset()
            self.state.intent = "create"
            self.state.phase = ConversationPhase.CONTEXT
            response = "Starting a new dashboard. What would you like to create?"
            self.state.messages.append(Message(role="assistant", content=response))
            return response

        # Check if done/quit/exit
        if any(
            phrase in lower_input
            for phrase in ["looks good", "done", "perfect", "that's all", "no changes", "quit", "exit"]
        ) or lower_input in ["done", "quit", "exit"]:
            slug = self.state.created_file.parent.name if self.state.created_file else "dashboard"
            response = f"Great! Your dashboard is ready at: {self.config.dev_url}/{slug}\n\nClick '+ New' in the top right to create another dashboard."
            self.state.messages.append(Message(role="assistant", content=response))
            return response

        # Process refinement request
        if self.state.generated_markdown and self.state.created_file:
            # Include current markdown in context
            current_content = self.state.created_file.read_text()
            refinement_prompt = f"""The current dashboard markdown is:

```markdown
{current_content}
```

The user wants to make this change: {user_input}

Generate the complete updated markdown. Output ONLY the markdown, nothing else."""

            self.state.messages.append(Message(role="user", content=refinement_prompt))

            response = self.llm.generate(
                messages=self.state.messages,
                system_prompt=self.get_system_prompt(),
                temperature=0.3,
            )

            new_markdown = response.content

            # Clean up
            if new_markdown.startswith("```"):
                new_markdown = new_markdown.split("\n", 1)[1]
            if new_markdown.endswith("```"):
                new_markdown = new_markdown.rsplit("```", 1)[0]

            # Update file
            self.state.created_file.write_text(new_markdown.strip())
            self.state.generated_markdown = new_markdown

            slug = self.state.created_file.parent.name
            result = f"""✓ Dashboard updated: {slug}

Refresh {self.config.dev_url}/{slug} to see changes.

What else would you like to change?"""

            self.state.messages.append(Message(role="assistant", content=result))
            return result

        return self._handle_conversation_phase(user_input)

    def _summarize_markdown(self, markdown: str) -> str:
        """Create a brief summary of the generated markdown."""
        lines = []

        # Count queries
        query_count = markdown.count("```sql")
        if query_count:
            lines.append(f"- {query_count} SQL queries")

        # Count components
        components = {
            "BarChart": markdown.count("<BarChart"),
            "LineChart": markdown.count("<LineChart"),
            "DataTable": markdown.count("<DataTable"),
            "BigValue": markdown.count("<BigValue"),
            "Dropdown": markdown.count("<Dropdown"),
        }

        for comp, count in components.items():
            if count:
                lines.append(f"- {count} {comp}(s)")

        return "\n".join(lines) if lines else "- Dashboard content generated"

    def _run_qa_validation(self, dashboard_slug: str) -> QAResult | None:
        """
        Run QA validation on a generated dashboard.

        Args:
            dashboard_slug: The dashboard slug to validate.

        Returns:
            QAResult object, or None if QA couldn't run.
        """
        qa_request = self.get_full_user_request()
        if not qa_request:
            return None

        try:
            qa = DashboardQA(provider_name=self._provider_name)
            return qa.validate(
                dashboard_slug=dashboard_slug,
                original_request=qa_request,
            )
        except Exception as e:
            # Return a failed result with the error
            return QAResult(
                passed=False,
                summary=f"QA could not run: {e}",
                critical_issues=[],
                suggestions=[],
            )

    def _format_qa_result(self, result: QAResult, auto_fix_attempted: bool = False, fixed_issues: list[str] = None) -> str:
        """Format QA result for display to user.

        Args:
            result: The final QA result after any auto-fix attempts
            auto_fix_attempted: Whether auto-fix was attempted
            fixed_issues: List of issues that were successfully fixed (no longer in result.critical_issues)
        """
        fixed_issues = fixed_issues or []

        # Determine final status based on whether there are STILL critical issues
        if result.critical_issues:
            # Dashboard is still broken - be honest about it
            status = "✗ QA FAILED - Dashboard has critical issues"
        elif auto_fix_attempted and fixed_issues:
            # Auto-fix worked - all issues resolved
            status = "✓ QA PASSED (after auto-fix)"
        elif result.passed:
            status = "✓ QA PASSED"
        else:
            status = "✗ QA NEEDS ATTENTION"

        output = f"\n--- QA Validation ---\n{status}\n"

        if result.summary:
            output += f"Summary: {result.summary}\n"

        # Show what was successfully fixed
        if fixed_issues:
            output += f"\n🔧 Auto-fixed {len(fixed_issues)} issue(s):\n"
            for issue in fixed_issues:
                output += f"  ✓ {issue}\n"

        # Show remaining critical issues that need human intervention
        if result.critical_issues:
            output += "\n⚠️ Remaining critical issues (need your input):\n"
            for issue in result.critical_issues:
                output += f"  • {issue}\n"

        if result.suggestions:
            output += "\nSuggestions (optional):\n"
            for suggestion in result.suggestions:
                output += f"  • {suggestion}\n"

        return output

    def _format_infeasibility_message(self, feasibility) -> str:
        """Format a user-friendly message when the request is not feasible."""
        msg = "⚠️ **Cannot build this dashboard**\n\n"
        msg += f"{feasibility.explanation}\n\n"

        if feasibility.infeasible_parts:
            msg += "**What's missing:**\n"
            for part in feasibility.infeasible_parts[:5]:
                msg += f"  • {part}\n"
            msg += "\n"

        if feasibility.suggested_alternative:
            msg += f"**What I can build instead:**\n{feasibility.suggested_alternative}\n\n"
            msg += "Would you like me to build the alternative dashboard, or would you like to describe something else?"
        else:
            msg += "Please describe a different dashboard that works with your available data."

        return msg

    def _format_partial_feasibility_message(self, feasibility) -> str:
        """Format a message about partial feasibility."""
        msg = "**Note about your data:**\n\n"

        if feasibility.feasible_parts:
            msg += "✓ **Can build:**\n"
            for part in feasibility.feasible_parts[:3]:
                msg += f"  • {part}\n"
            msg += "\n"

        if feasibility.infeasible_parts:
            msg += "✗ **Cannot build (data not available):**\n"
            for part in feasibility.infeasible_parts[:3]:
                msg += f"  • {part}\n"
            msg += "\n"

        if feasibility.suggested_alternative:
            msg += f"**Suggestion:** {feasibility.suggested_alternative}"

        return msg

    def select_dashboard_for_edit(self, dashboard_name: str) -> str:
        """Select a dashboard for editing."""
        dashboards = self.parser.list_dashboards()

        for dash_path in dashboards:
            if dashboard_name.lower() in dash_path.stem.lower():
                self.state.target_dashboard = dash_path.stem
                self.state.phase = ConversationPhase.CONTEXT

                # Parse and summarize the dashboard
                parsed = self.parser.parse_file(dash_path)
                summary = parsed.get_summary()

                response = f"Selected: {dash_path.name}\n\n{summary}\n\nWhat would you like to change?"
                self.state.messages.append(Message(role="assistant", content=response))
                return response

        return f"Dashboard '{dashboard_name}' not found. Please try again."


def create_conversation() -> ConversationManager:
    """
    Create a new conversation manager.

    Returns:
        A new ConversationManager instance.
    """
    return ConversationManager()
