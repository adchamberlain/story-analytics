"""
Configuration loader for the conversation engine.

Loads prompts, dialect rules, component definitions, and QA rules from YAML files.
This allows the engine behavior to be customized per deployment without code changes.
"""

from pathlib import Path
from typing import Any

import yaml


class ConfigLoader:
    """Loads and manages configuration from YAML files."""

    def __init__(self, engine_dir: Path | None = None):
        if engine_dir is None:
            engine_dir = Path(__file__).parent
        self.engine_dir = engine_dir
        self.project_root = engine_dir.parent

        # Cache loaded configs
        self._prompts_cache: dict[str, dict] = {}
        self._components_cache: dict | None = None
        self._qa_rules_cache: dict | None = None
        self._dialect_cache: dict[str, dict] = {}

    def _load_yaml(self, path: Path) -> dict:
        """Load a YAML file."""
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")
        with open(path) as f:
            return yaml.safe_load(f) or {}

    # --- Prompts ---

    def get_prompt(self, name: str) -> dict:
        """
        Load a prompt configuration by name.

        Args:
            name: Prompt name (e.g., 'base', 'create', 'edit', 'generate')

        Returns:
            Dict with prompt configuration
        """
        if name not in self._prompts_cache:
            path = self.engine_dir / "prompts" / f"{name}.yaml"
            self._prompts_cache[name] = self._load_yaml(path)
        return self._prompts_cache[name]

    def get_base_prompt(self) -> str:
        """Get the base system prompt text."""
        config = self.get_prompt("base")
        return f"{config.get('role', '')}\n\n{config.get('guidelines', '')}"

    def get_create_prompt(self) -> str:
        """Get the create dashboard prompt text."""
        config = self.get_prompt("create")
        return f"{config.get('instructions', '')}\n\n{config.get('proposal_rules', '')}"

    def get_edit_prompt(self, dashboard_content: str) -> str:
        """Get the edit dashboard prompt text."""
        config = self.get_prompt("edit")
        instructions = config.get("instructions", "")
        return f"{instructions}\n\nCurrent dashboard content:\n\n{dashboard_content}"

    def get_generate_prompt(self) -> str:
        """Get the generation prompt text."""
        config = self.get_prompt("generate")
        return config.get("instructions", "")

    # --- Components ---

    def get_components(self) -> dict:
        """Load the UI components configuration (Evidence components, etc.)."""
        if self._components_cache is None:
            path = self.engine_dir / "components" / "evidence.yaml"
            self._components_cache = self._load_yaml(path)
        return self._components_cache

    def get_components_prompt(self) -> str:
        """Get component documentation formatted for the LLM prompt."""
        components = self.get_components()
        lines = ["AVAILABLE COMPONENTS:", ""]

        for comp_name, comp_config in components.get("components", {}).items():
            lines.append(f"{comp_name}: {comp_config.get('description', '')}")

            # Required props
            if "required_props" in comp_config:
                lines.append("  Required props:")
                for prop in comp_config["required_props"]:
                    if isinstance(prop, dict):
                        for k, v in prop.items():
                            lines.append(f"    - {k}: {v}")
                    else:
                        lines.append(f"    - {prop}")

            # Notes
            if "notes" in comp_config:
                lines.append("  Notes:")
                for note in comp_config["notes"]:
                    lines.append(f"    - {note}")

            # Example
            if "example" in comp_config:
                lines.append(f"  Example: {comp_config['example'].strip()}")

            lines.append("")

        # Common mistakes
        if "common_mistakes" in components:
            lines.append("COMMON MISTAKES TO AVOID:")
            for mistake in components["common_mistakes"]:
                lines.append(f"  - {mistake.get('mistake', '')} → {mistake.get('correct', '')}")

        return "\n".join(lines)

    # --- SQL Dialect ---

    def get_dialect(self, source_name: str) -> dict:
        """
        Load SQL dialect rules for a data source.

        Args:
            source_name: Name of the source (e.g., 'snowflake_saas')

        Returns:
            Dict with dialect configuration
        """
        if source_name not in self._dialect_cache:
            path = self.project_root / "sources" / source_name / "dialect.yaml"
            if path.exists():
                self._dialect_cache[source_name] = self._load_yaml(path)
            else:
                # Return empty dict if no dialect file (use defaults)
                self._dialect_cache[source_name] = {}
        return self._dialect_cache[source_name]

    def get_dialect_prompt(self, source_name: str) -> str:
        """Get SQL dialect rules formatted for the LLM prompt."""
        dialect = self.get_dialect(source_name)
        if not dialect:
            return ""

        lines = [f"SQL RULES FOR {source_name.upper()}:", ""]

        # Table reference format
        table_ref = dialect.get("table_reference", {})
        if table_ref:
            lines.append(f"Table references: {table_ref.get('note', '')}")
            lines.append(f"  Format: {table_ref.get('format', '')}")
            lines.append(f"  Example: {table_ref.get('example', '')}")
            lines.append("")

        # Date functions
        date_funcs = dialect.get("date_functions", {})
        if date_funcs.get("allowed"):
            lines.append("ALLOWED date functions:")
            for func in date_funcs["allowed"]:
                lines.append(f"  - {func.get('name', '')}: {func.get('syntax', '')}")
            lines.append("")

        if date_funcs.get("forbidden"):
            lines.append("FORBIDDEN - NEVER use these:")
            for func in date_funcs["forbidden"]:
                lines.append(f"  - {func.get('name', '')}: {func.get('reason', '')}")
                if func.get("alternative"):
                    lines.append(f"    Use instead: {func['alternative']}")
            lines.append("")

        # General rules
        if dialect.get("general_rules"):
            lines.append("General SQL rules:")
            for rule in dialect["general_rules"]:
                lines.append(f"  - {rule}")

        return "\n".join(lines)

    # --- QA Rules ---

    def get_qa_rules(self) -> dict:
        """Load QA validation rules."""
        if self._qa_rules_cache is None:
            path = self.engine_dir / "qa" / "rules.yaml"
            self._qa_rules_cache = self._load_yaml(path)
        return self._qa_rules_cache

    def get_qa_validation_prompt(self, original_request: str) -> str:
        """Get the QA validation prompt with variables filled in."""
        rules = self.get_qa_rules()
        template = rules.get("validation_prompt", "")
        return template.format(original_request=original_request)

    def get_qa_auto_fix_prompt(self, issues: list[str], current_content: str) -> str:
        """Get the auto-fix prompt with variables filled in."""
        rules = self.get_qa_rules()
        template = rules.get("auto_fix_prompt", "")
        issues_text = "\n".join(f"- {issue}" for issue in issues)
        return template.format(issues=issues_text, current_content=current_content)

    def is_qa_enabled(self) -> bool:
        """Check if QA validation is enabled."""
        rules = self.get_qa_rules()
        return rules.get("validation", {}).get("enabled", True)

    def get_max_auto_fix_attempts(self) -> int:
        """Get the maximum number of auto-fix attempts."""
        rules = self.get_qa_rules()
        return rules.get("validation", {}).get("max_auto_fix_attempts", 2)

    def should_auto_fix_critical(self) -> bool:
        """Check if critical issues should be auto-fixed."""
        rules = self.get_qa_rules()
        return rules.get("critical_issues", {}).get("auto_fix", True)


# Global instance
_config_loader: ConfigLoader | None = None


def get_config_loader() -> ConfigLoader:
    """Get the global config loader instance."""
    global _config_loader
    if _config_loader is None:
        _config_loader = ConfigLoader()
    return _config_loader
