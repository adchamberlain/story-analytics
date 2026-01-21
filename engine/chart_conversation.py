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
from pathlib import Path
from typing import Any

from .chart_pipeline import ChartPipeline, ChartPipelineConfig, ChartPipelineResult
from .config import get_config
from .dashboard_composer import create_chart_dashboard, get_composer
from .llm.base import Message
from .llm.claude import get_provider
from .models import Chart, ValidatedChart, get_chart_storage


class ChartPhase(Enum):
    """Phases of chart creation conversation."""

    WAITING = "waiting"  # Waiting for user input
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
    error: str | None = None


@dataclass
class ChartConversationState:
    """Tracks state of a chart conversation."""

    phase: ChartPhase = ChartPhase.WAITING
    messages: list[Message] = field(default_factory=list)

    # Current chart
    current_chart: ValidatedChart | None = None
    current_chart_id: str | None = None
    chart_file_path: Path | None = None
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
    ):
        self.config = get_config()
        self.llm = get_provider(provider_name)
        self._provider_name = provider_name
        self.state = ChartConversationState()
        self.chart_storage = get_chart_storage()
        self.composer = get_composer()

        # Initialize chart pipeline
        self._pipeline = ChartPipeline(
            ChartPipelineConfig(
                provider_name=provider_name,
                verbose=True,
            )
        )

        print(f"[ChartConversation] Using provider: {self.llm.name}")

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
        if self.state.phase == ChartPhase.WAITING:
            return self._handle_new_chart_request(user_input)
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

        elif action_id == "add_to_dashboard":
            # Future: implement dashboard selection
            return ChartConversationResult(
                response="Dashboard composition coming soon. For now, your chart has been saved.",
                chart_id=self.state.current_chart_id,
            )

        else:
            return ChartConversationResult(
                response=f"Unknown action: {action_id}",
            )

    def _handle_new_chart_request(self, user_input: str) -> ChartConversationResult:
        """Handle a request for a new chart."""
        self.state.original_request = user_input
        self.state.phase = ChartPhase.GENERATING

        print(f"[ChartConversation] Generating chart for: {user_input[:50]}...")

        # Run the chart pipeline
        result = self._pipeline.run(user_input)

        if not result.success:
            self.state.phase = ChartPhase.WAITING
            return ChartConversationResult(
                response=f"I couldn't create that chart: {result.error}\n\nCould you try describing it differently?",
                error=result.error,
            )

        # Store the chart
        chart = result.chart
        stored_chart = Chart.from_validated(chart)
        self.chart_storage.save(stored_chart)

        self.state.current_chart = chart
        self.state.current_chart_id = stored_chart.id

        # Create a preview dashboard for viewing
        dashboard, file_path = create_chart_dashboard(stored_chart)
        self.state.chart_file_path = file_path
        self.state.dashboard_slug = dashboard.slug

        # Build response
        chart_url = f"{self.config.dev_url}/{dashboard.slug}?embed=true"

        self.state.phase = ChartPhase.VIEWING

        response = f"""Created: **{chart.spec.title}**

{chart.spec.description}

View your chart at: {chart_url}

What would you like to do next?"""

        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            chart_url=chart_url,
            chart_id=stored_chart.id,
            action_buttons=[
                ChartActionButton(id="done", label="Done", style="primary"),
                ChartActionButton(id="new_chart", label="Create Another", style="secondary"),
            ],
        )

    def _handle_refinement_request(self, user_input: str) -> ChartConversationResult:
        """Handle a refinement request for the current chart."""
        if not self.state.current_chart or not self.state.chart_file_path:
            return self._handle_new_chart_request(user_input)

        # Combine original request with refinement
        combined_request = f"{self.state.original_request}\n\nRefinement: {user_input}"

        print(f"[ChartConversation] Refining chart: {user_input[:50]}...")

        # Regenerate with the refinement
        result = self._pipeline.run(combined_request)

        if not result.success:
            return ChartConversationResult(
                response=f"I couldn't make that change: {result.error}\n\nCould you try describing it differently?",
                error=result.error,
                action_buttons=[
                    ChartActionButton(id="done", label="Keep Current", style="primary"),
                    ChartActionButton(id="new_chart", label="Start Over", style="secondary"),
                ],
            )

        # Update stored chart
        chart = result.chart
        stored_chart = Chart.from_validated(chart)
        stored_chart.id = self.state.current_chart_id  # Keep same ID
        self.chart_storage.save(stored_chart)

        self.state.current_chart = chart

        # Update the dashboard file
        dashboard, file_path = create_chart_dashboard(stored_chart)
        self.state.chart_file_path = file_path

        chart_url = f"{self.config.dev_url}/{dashboard.slug}?embed=true"

        response = f"""Updated: **{chart.spec.title}**

Refresh to see changes: {chart_url}

What else would you like to change?"""

        self.state.messages.append(Message(role="assistant", content=response))

        return ChartConversationResult(
            response=response,
            chart_url=chart_url,
            chart_id=stored_chart.id,
            action_buttons=[
                ChartActionButton(id="done", label="Done", style="primary"),
                ChartActionButton(id="new_chart", label="Create Another", style="secondary"),
            ],
        )

    def get_current_chart(self) -> Chart | None:
        """Get the current chart if one exists."""
        if self.state.current_chart_id:
            return self.chart_storage.get(self.state.current_chart_id)
        return None

    def get_chart_embed_url(self) -> str | None:
        """Get the embed URL for the current chart."""
        if self.state.dashboard_slug:
            return f"{self.config.dev_url}/{self.state.dashboard_slug}?embed=true"
        return None


def create_chart_conversation(provider_name: str | None = None) -> ChartConversationManager:
    """Create a new chart conversation manager."""
    return ChartConversationManager(provider_name=provider_name)
