"""
CLI interface for the conversation engine.

Provides a rich terminal UI for creating and editing dashboards.
"""

import sys

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.theme import Theme

from .brand import write_brand_css
from .conversation import ConversationManager, ConversationPhase
from .parser import DashboardParser

# Custom theme
custom_theme = Theme(
    {
        "info": "cyan",
        "warning": "yellow",
        "error": "red bold",
        "success": "green bold",
        "user": "blue",
        "assistant": "white",
    }
)

console = Console(theme=custom_theme)


def print_welcome():
    """Print welcome message."""
    welcome = """
# Dashboard Builder

Create and edit Evidence dashboards using natural language.

**Commands:**
- Type your request to create or edit a dashboard
- `list` - Show existing dashboards
- `new` - Start a new conversation
- `brand` - Apply brand configuration (edit brand_config.yaml first)
- `quit` or `exit` - Exit the CLI

**Examples:**
- "Create a customer churn dashboard"
- "Edit the saas-dashboard"
- "I need a revenue trends dashboard"
"""
    console.print(Panel(Markdown(welcome), title="Welcome", border_style="blue"))


def apply_brand():
    """Apply brand configuration from brand_config.yaml."""
    try:
        css_path = write_brand_css()
        console.print(f"[success]Brand CSS updated: {css_path}[/success]")
        console.print("[info]Refresh your browser to see changes.[/info]")
    except Exception as e:
        console.print(f"[error]Failed to apply brand: {e}[/error]")


def print_dashboards():
    """List existing dashboards."""
    parser = DashboardParser()
    summaries = parser.get_dashboard_summaries()

    if not summaries:
        console.print("[warning]No dashboards found.[/warning]")
        return

    console.print("\n[info]Existing Dashboards:[/info]")
    for dash in summaries:
        if "error" in dash:
            console.print(f"  • {dash['file']} [error](error)[/error]")
        else:
            console.print(
                f"  • [bold]{dash['title']}[/bold] ({dash['file']}) - "
                f"{dash['queries']} queries, {dash['components']} components"
            )
    console.print()


def run_conversation(manager: ConversationManager):
    """Run the main conversation loop."""
    while True:
        try:
            # Get user input
            user_input = Prompt.ask("\n[user]You[/user]")

            if not user_input.strip():
                continue

            # Handle special commands
            lower_input = user_input.lower().strip()

            if lower_input in ("quit", "exit", "q"):
                console.print("[info]Goodbye![/info]")
                break

            if lower_input == "list":
                print_dashboards()
                continue

            if lower_input == "new":
                manager.reset()
                console.print("[info]Starting new conversation...[/info]")
                continue

            if lower_input == "help":
                print_welcome()
                continue

            if lower_input == "brand":
                apply_brand()
                continue

            # Handle dashboard selection in edit mode
            if (
                manager.state.intent == "edit"
                and manager.state.target_dashboard is None
                and manager.state.phase == ConversationPhase.INTENT
            ):
                # User is selecting a dashboard to edit
                response = manager.select_dashboard_for_edit(user_input)
                console.print(f"\n[assistant]Assistant:[/assistant] {response}")
                continue

            # Process the message
            console.print("[info]Thinking...[/info]", end="\r")
            response = manager.process_message(user_input)

            # Clear the "Thinking..." message and print response
            console.print(" " * 20, end="\r")
            console.print(f"\n[assistant]Assistant:[/assistant]")
            console.print(Panel(response, border_style="dim"))

        except KeyboardInterrupt:
            console.print("\n[info]Use 'quit' to exit.[/info]")
        except Exception as e:
            console.print(f"[error]Error: {e}[/error]")


def main():
    """Main entry point for the CLI."""
    console.print()
    print_welcome()

    # Check for API key
    import os

    if not os.environ.get("ANTHROPIC_API_KEY"):
        console.print(
            "[error]Error: ANTHROPIC_API_KEY environment variable not set.[/error]"
        )
        console.print("Set it with: export ANTHROPIC_API_KEY='your-key-here'")
        sys.exit(1)

    # Create conversation manager
    try:
        manager = ConversationManager()
        console.print("[success]Connected to database successfully.[/success]")
    except Exception as e:
        console.print(f"[error]Failed to initialize: {e}[/error]")
        sys.exit(1)

    # Show existing dashboards
    print_dashboards()

    # Start conversation
    console.print("[info]What would you like to do?[/info]")
    run_conversation(manager)


if __name__ == "__main__":
    main()
