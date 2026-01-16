"""
Conversation manager for dashboard creation and editing.

Orchestrates the multi-phase conversation flow between user and LLM.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from .config import get_config
from .config_loader import get_config_loader
from .generator import create_dashboard_from_markdown
from .llm.base import LLMResponse, Message
from .llm.claude import get_provider
from .parser import DashboardParser, ParsedDashboard
from .qa import DashboardQA, QAResult
from .schema import get_schema_context


class ConversationPhase(Enum):
    """Phases of the dashboard creation conversation."""

    INTENT = "intent"  # Determine create vs edit
    CONTEXT = "context"  # What decision should this help make?
    DATA_DISCOVERY = "data_discovery"  # What tables/columns?
    METRIC_DEFINITION = "metric_definition"  # How to calculate?
    GENERATION = "generation"  # Generate the dashboard
    REFINEMENT = "refinement"  # Iterate on feedback


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


# System prompts are now loaded from YAML config files
# See engine/prompts/ directory for customizable prompt templates


class ConversationManager:
    """Manages the conversation flow for dashboard creation/editing."""

    def __init__(self):
        self.config = get_config()
        self.config_loader = get_config_loader()
        self.llm = get_provider()
        self.parser = DashboardParser()
        self.state = ConversationState()
        self._schema_context: str | None = None
        self._default_source = "snowflake_saas"  # TODO: make configurable

    def reset(self):
        """Reset conversation state."""
        self.state = ConversationState()

    def get_schema_context(self) -> str:
        """Get cached schema context."""
        if self._schema_context is None:
            self._schema_context = get_schema_context()
        return self._schema_context

    def get_system_prompt(self) -> str:
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

    def process_message(self, user_input: str) -> str:
        """
        Process a user message and return the assistant's response.

        Args:
            user_input: The user's message.

        Returns:
            The assistant's response.
        """
        # Add user message to history
        self.state.messages.append(Message(role="user", content=user_input))

        # Handle based on current phase
        if self.state.phase == ConversationPhase.INTENT:
            return self._handle_intent_phase(user_input)
        elif self.state.phase == ConversationPhase.GENERATION:
            return self._handle_generation_phase(user_input)
        elif self.state.phase == ConversationPhase.REFINEMENT:
            return self._handle_refinement_phase(user_input)
        else:
            return self._handle_conversation_phase(user_input)

    def _handle_intent_phase(self, user_input: str) -> str:
        """Determine if user wants to create or edit."""
        lower_input = user_input.lower()

        # Check for edit intent
        if any(word in lower_input for word in ["edit", "modify", "change", "update"]):
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

        # Regular conversation - send to LLM
        response = self.llm.generate(
            messages=self.state.messages,
            system_prompt=self.get_system_prompt(),
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
        """Generate the actual dashboard markdown."""
        # Ask LLM to generate complete dashboard
        generation_prompt = """Based on our conversation, generate a complete Evidence markdown dashboard.

Output ONLY the markdown content, starting with # Title.
Include all necessary SQL queries and visualizations.
Make sure all SQL queries reference the correct table names from the schema.
Use the snowflake_saas source for all queries."""

        self.state.messages.append(Message(role="user", content=generation_prompt))

        response = self.llm.generate(
            messages=self.state.messages,
            system_prompt=self.get_system_prompt(),
            temperature=0.3,  # Lower temperature for more consistent output
            max_tokens=4096,
        )

        markdown = response.content

        # Clean up markdown (remove code fences if LLM wrapped it)
        if markdown.startswith("```markdown"):
            markdown = markdown[len("```markdown") :].strip()
        if markdown.startswith("```"):
            markdown = markdown[3:].strip()
        if markdown.endswith("```"):
            markdown = markdown[:-3].strip()

        self.state.generated_markdown = markdown

        # Extract title for filename
        title_match = markdown.split("\n")[0]
        if title_match.startswith("#"):
            title = title_match.lstrip("#").strip()
        else:
            title = "generated-dashboard"

        self.state.dashboard_title = title

        # Write the dashboard
        try:
            file_path = create_dashboard_from_markdown(markdown, title)
            self.state.created_file = file_path
            self.state.phase = ConversationPhase.REFINEMENT

            url = f"{self.config.dev_url}/{file_path.stem}"

            # Run QA validation with auto-fix loop (if enabled)
            qa_result = None
            auto_fixed = False
            all_fixed_issues = []

            if self.config_loader.is_qa_enabled():
                max_fix_attempts = self.config_loader.get_max_auto_fix_attempts()
                should_auto_fix = self.config_loader.should_auto_fix_critical()

                for attempt in range(max_fix_attempts + 1):
                    qa_result = self._run_qa_validation(file_path.stem)

                    if qa_result is None:
                        break

                    if qa_result.needs_auto_fix and should_auto_fix and attempt < max_fix_attempts:
                        # Auto-fix critical issues
                        all_fixed_issues.extend(qa_result.critical_issues)
                        fixed_markdown = self._auto_fix_issues(qa_result.critical_issues)
                        file_path.write_text(fixed_markdown)
                        self.state.generated_markdown = fixed_markdown
                        auto_fixed = True
                        # Loop continues to re-run QA
                    else:
                        # No critical issues or max attempts reached
                        break

            # Build result message
            result = f"""✓ Dashboard created: {file_path.name}

View it at: {url}

Here's what I created:
{self._summarize_markdown(self.state.generated_markdown)}
"""
            if auto_fixed:
                result += f"\n🔧 Auto-fixed {len(all_fixed_issues)} critical issue(s):\n"
                for issue in all_fixed_issues:
                    result += f"  • {issue}\n"

            if qa_result:
                result += self._format_qa_result(qa_result, auto_fixed=auto_fixed)

            if qa_result and qa_result.suggestions:
                result += "\nWould you like me to implement any of these suggestions? Or tell me what else to change."
            else:
                result += "\nWhat would you like to change?"

        except Exception as e:
            result = f"Error creating dashboard: {e}\n\nHere's the markdown I generated:\n\n{markdown[:500]}..."

        self.state.messages.append(Message(role="assistant", content=result))
        return result

    def _handle_refinement_phase(self, user_input: str) -> str:
        """Handle refinement requests after initial generation."""
        lower_input = user_input.lower()

        # Check if user wants to create a NEW dashboard (not edit current one)
        if any(
            phrase in lower_input
            for phrase in ["create a new", "new dashboard", "different dashboard", "another dashboard", "start over"]
        ):
            self.reset()
            self.state.intent = "create"
            self.state.phase = ConversationPhase.CONTEXT
            return self._handle_conversation_phase(user_input)

        # Check if done
        if any(
            phrase in lower_input
            for phrase in ["looks good", "done", "perfect", "that's all", "no changes"]
        ):
            return f"Great! Your dashboard is ready at: {self.config.dev_url}/{self.state.created_file.stem}\n\nType 'new' to create another dashboard, or 'quit' to exit."

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

            result = f"""✓ Dashboard updated: {self.state.created_file.name}

Refresh {self.config.dev_url}/{self.state.created_file.stem} to see changes.

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
        if not self.state.original_request:
            return None

        try:
            qa = DashboardQA()
            return qa.validate(
                dashboard_slug=dashboard_slug,
                original_request=self.state.original_request,
            )
        except Exception as e:
            # Return a failed result with the error
            return QAResult(
                passed=False,
                summary=f"QA could not run: {e}",
                critical_issues=[],
                suggestions=[],
            )

    def _auto_fix_issues(self, critical_issues: list[str]) -> str:
        """
        Automatically fix critical issues in the dashboard.

        Args:
            critical_issues: List of critical issues to fix.

        Returns:
            Updated markdown content.
        """
        current_content = self.state.created_file.read_text()

        # Get fix prompt from config
        fix_prompt = self.config_loader.get_qa_auto_fix_prompt(
            issues=critical_issues,
            current_content=current_content
        )

        self.state.messages.append(Message(role="user", content=fix_prompt))

        response = self.llm.generate(
            messages=self.state.messages,
            system_prompt=self.get_system_prompt(),
            temperature=0.3,
        )

        new_markdown = response.content

        # Clean up markdown fences
        if new_markdown.startswith("```markdown"):
            new_markdown = new_markdown[len("```markdown"):].strip()
        if new_markdown.startswith("```"):
            new_markdown = new_markdown.split("\n", 1)[1] if "\n" in new_markdown else new_markdown[3:]
        if new_markdown.endswith("```"):
            new_markdown = new_markdown.rsplit("```", 1)[0]

        return new_markdown.strip()

    def _format_qa_result(self, result: QAResult, auto_fixed: bool = False) -> str:
        """Format QA result for display to user."""
        if auto_fixed:
            status = "✓ QA PASSED (after auto-fix)"
        else:
            status = "✓ QA PASSED" if result.passed else "✗ QA NEEDS ATTENTION"

        output = f"\n--- QA Validation ---\n{status}\n"

        if result.summary:
            output += f"Summary: {result.summary}\n"

        # Don't show critical issues if we auto-fixed (they're resolved)
        if result.critical_issues and not auto_fixed:
            output += "\nCritical issues (will auto-fix):\n"
            for issue in result.critical_issues:
                output += f"  • {issue}\n"

        if result.suggestions:
            output += "\nSuggestions (optional):\n"
            for suggestion in result.suggestions:
                output += f"  • {suggestion}\n"

        return output

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
    """Create a new conversation manager."""
    return ConversationManager()
