"""
Conversation manager for dashboard creation and editing.

Orchestrates the multi-phase conversation flow between user and LLM.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from .config import get_config
from .generator import create_dashboard_from_markdown
from .llm.base import LLMResponse, Message
from .llm.claude import get_provider
from .parser import DashboardParser, ParsedDashboard
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


# System prompts for different phases
SYSTEM_PROMPTS = {
    "base": """You are an expert data analyst and dashboard designer. You help users create
beautiful, insightful dashboards using Evidence (an open-source BI tool that uses markdown).

You have access to a Snowflake database with the following schema:

{schema}

CRITICAL SQL RULES:
- In SQL queries, reference tables by name ONLY (e.g., "FROM customers"), NOT with database/schema prefixes
- NEVER use "FROM database.schema.table" format - Evidence handles the connection automatically
- Table names are: customers, users, subscriptions, events, invoices

When generating dashboards, use Evidence markdown syntax:
- SQL queries in ```sql query_name ... ``` blocks
- Charts: <BarChart data={{query_name}} x="col" y="col" />
- Tables: <DataTable data={{query_name}} />
- Filters: <Dropdown name="filter" data={{query_name}} value="col" />
- Big numbers: <BigValue data={{query_name}} value="col" />

Keep dashboards focused and actionable - fewer, more meaningful visualizations are better.""",
    "create": """Help the user create a new dashboard. Guide them through:
1. Understanding what decisions this dashboard should support
2. Identifying relevant data from the available tables
3. Defining key metrics and calculations
4. Generating a clean, focused dashboard

Ask clarifying questions when needed. Be conversational but efficient.""",
    "edit": """Help the user modify an existing dashboard. The current dashboard content is:

{dashboard_content}

Help them make targeted changes while preserving the existing structure where appropriate.
Show them what you plan to change before making modifications.""",
    "generate": """Generate a complete Evidence markdown dashboard based on the conversation.
Output ONLY the markdown content, nothing else. Start with a # Title and include all necessary
SQL queries and visualizations. Make it production-ready.""",
}


class ConversationManager:
    """Manages the conversation flow for dashboard creation/editing."""

    def __init__(self):
        self.config = get_config()
        self.llm = get_provider()
        self.parser = DashboardParser()
        self.state = ConversationState()
        self._schema_context: str | None = None

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
        schema = self.get_schema_context()
        base_prompt = SYSTEM_PROMPTS["base"].format(schema=schema)

        if self.state.intent == "edit" and self.state.target_dashboard:
            # Load dashboard content for edit mode
            dashboards = self.parser.list_dashboards()
            for dash_path in dashboards:
                if dash_path.stem == self.state.target_dashboard:
                    content = dash_path.read_text()
                    edit_prompt = SYSTEM_PROMPTS["edit"].format(dashboard_content=content)
                    return base_prompt + "\n\n" + edit_prompt

        if self.state.phase == ConversationPhase.GENERATION:
            return base_prompt + "\n\n" + SYSTEM_PROMPTS["generate"]

        return base_prompt + "\n\n" + SYSTEM_PROMPTS["create"]

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

        # If the message contains dashboard topic, pass it to LLM
        if len(user_input.split()) > 3:  # More than just "create dashboard"
            return self._handle_conversation_phase(user_input)

        response = "Great! Let's create a new dashboard.\n\nWhat kind of dashboard would you like to create? What business decisions should it help you make?"
        self.state.messages.append(Message(role="assistant", content=response))
        return response

    def _handle_conversation_phase(self, user_input: str) -> str:
        """Handle general conversation with LLM."""
        # Check if user wants to generate
        lower_input = user_input.lower()
        if any(
            phrase in lower_input
            for phrase in ["generate", "create it", "build it", "looks good", "that's it", "let's do it"]
        ):
            self.state.phase = ConversationPhase.GENERATION
            return self._generate_dashboard()

        # Regular conversation - send to LLM
        response = self.llm.generate(
            messages=self.state.messages,
            system_prompt=self.get_system_prompt(),
            temperature=0.7,
        )

        self.state.messages.append(Message(role="assistant", content=response.content))
        return response.content

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
            result = f"""✓ Dashboard created: {file_path.name}

View it at: {url}

Here's what I created:
{self._summarize_markdown(markdown)}

What would you like to change?"""

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
