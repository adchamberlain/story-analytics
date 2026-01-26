"""
Semantic layer generator using LLM analysis.

Analyzes database schema and sample data to generate rich semantic
documentation that helps LLMs understand business context.
"""

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from .config_loader import get_config_loader
from .llm import Message, get_provider
from .schema import Schema, get_schema
from .semantic import (
    BusinessContext,
    ColumnSemantic,
    QueryPattern,
    Relationship,
    SemanticLayer,
    TableSemantic,
)


class SemanticGenerator:
    """
    Generates semantic layer documentation using LLM analysis.

    The generator:
    1. Introspects the database schema
    2. Samples data from each table
    3. Sends schema + samples to LLM for analysis
    4. Parses the LLM response into a SemanticLayer object
    5. Saves the result as semantic.yaml
    """

    def __init__(self, source_name: str = "snowflake_saas"):
        self.source_name = source_name
        self.config_loader = get_config_loader()
        self._schema: Schema | None = None

    def get_schema(self) -> Schema:
        """Get the database schema."""
        if self._schema is None:
            self._schema = get_schema(include_samples=True)
        return self._schema

    def get_schema_hash(self) -> str:
        """
        Generate a hash of the schema structure for staleness detection.

        The hash is based on table names, column names, and column types.
        Sample values are NOT included (they may change without schema changes).
        """
        schema = self.get_schema()
        hash_data = {
            "database": schema.database,
            "schema": schema.schema_name,
            "tables": [],
        }

        for table in sorted(schema.tables, key=lambda t: t.name):
            table_data = {
                "name": table.name,
                "columns": [
                    {"name": col.name, "type": col.data_type, "nullable": col.nullable}
                    for col in sorted(table.columns, key=lambda c: c.name)
                ],
            }
            hash_data["tables"].append(table_data)

        # Create deterministic JSON and hash it
        json_str = json.dumps(hash_data, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()[:12]

    def get_schema_definition(self) -> str:
        """Format schema for the LLM prompt."""
        schema = self.get_schema()
        lines = []

        for table in schema.tables:
            lines.append(f"## Table: {table.name}")
            if table.row_count:
                lines.append(f"Row count: {table.row_count:,}")
            lines.append("")
            lines.append("Columns:")

            for col in table.columns:
                nullable = "NULL" if col.nullable else "NOT NULL"
                lines.append(f"  - {col.name}: {col.data_type} {nullable}")

            lines.append("")

        return "\n".join(lines)

    def get_sample_data(self, max_rows: int = 5) -> str:
        """
        Format sample data for the LLM prompt.

        Shows the first few rows of each table along with distinct value
        counts for categorical columns.
        """
        schema = self.get_schema()
        lines = []

        for table in schema.tables:
            lines.append(f"## Sample data from {table.name}")
            lines.append("")

            # Show sample values for each column
            for col in table.columns:
                if col.sample_values:
                    values = col.sample_values[:10]
                    values_str = ", ".join(repr(v) for v in values)
                    lines.append(f"  {col.name}: {values_str}")

            lines.append("")

        return "\n".join(lines)

    def load_prompt_config(self) -> dict:
        """Load the semantic generation prompt configuration."""
        path = self.config_loader.engine_dir / "prompts" / "semantic" / "generate.yaml"
        return self.config_loader._load_yaml(path)

    def generate(
        self,
        provider_name: str | None = None,
        temperature: float = 0.3,
    ) -> SemanticLayer:
        """
        Generate a semantic layer by analyzing the schema with an LLM.

        Args:
            provider_name: Optional LLM provider to use (claude, openai, gemini)
            temperature: LLM temperature (lower = more deterministic)

        Returns:
            SemanticLayer object with generated documentation
        """
        # Load prompt configuration
        prompt_config = self.load_prompt_config()
        system_prompt = (
            prompt_config.get("system_prompt", "")
            + "\n\n"
            + prompt_config.get("instructions", "")
        )

        # Build user prompt
        user_template = prompt_config.get("user_prompt_template", "")
        schema_hash = self.get_schema_hash()

        user_prompt = user_template.format(
            source_name=self.source_name,
            schema_hash=schema_hash,
            schema_definition=self.get_schema_definition(),
            sample_data=self.get_sample_data(),
        )

        # Call LLM
        provider = get_provider(provider_name)
        print(f"[SemanticGenerator] Using {provider.name} ({provider.model})")
        print(f"[SemanticGenerator] Analyzing schema for {self.source_name}...")

        response = provider.generate(
            messages=[Message(role="user", content=user_prompt)],
            system_prompt=system_prompt,
            max_tokens=8192,
            temperature=temperature,
        )

        print(
            f"[SemanticGenerator] Generated {response.usage.get('output_tokens', 0)} tokens"
        )

        # Parse YAML from response
        semantic_layer = self._parse_response(response.content, schema_hash)

        return semantic_layer

    def _parse_response(self, content: str, schema_hash: str) -> SemanticLayer:
        """
        Parse the LLM response into a SemanticLayer object.

        Handles YAML extraction from markdown code blocks.
        """
        # Extract YAML from code blocks if present
        yaml_match = re.search(r"```ya?ml\s*(.*?)```", content, re.DOTALL)
        if yaml_match:
            yaml_content = yaml_match.group(1).strip()
        else:
            # Try to find raw YAML (starts with version:)
            yaml_match = re.search(r"(version:.*)", content, re.DOTALL)
            if yaml_match:
                yaml_content = yaml_match.group(1).strip()
            else:
                yaml_content = content.strip()

        try:
            data = yaml.safe_load(yaml_content)
        except yaml.YAMLError as e:
            print(f"[SemanticGenerator] YAML parse error: {e}")
            print(f"[SemanticGenerator] Raw content:\n{yaml_content[:500]}...")
            # Return a minimal semantic layer
            return SemanticLayer(
                version="1.0",
                generated_at=datetime.now().isoformat(),
                source_name=self.source_name,
                schema_hash=schema_hash,
                business_context=BusinessContext(
                    description="Failed to parse LLM response",
                    domain="Unknown",
                ),
            )

        # Ensure required fields
        if not data:
            data = {}

        data["schema_hash"] = schema_hash
        data["source_name"] = self.source_name

        if "generated_at" not in data:
            data["generated_at"] = datetime.now().isoformat()

        return SemanticLayer.from_dict(data)

    def save(self, semantic_layer: SemanticLayer, output_path: str | None = None) -> str:
        """
        Save the semantic layer to a YAML file.

        Args:
            semantic_layer: The semantic layer to save
            output_path: Optional custom output path. Defaults to
                        sources/{source_name}/semantic.yaml

        Returns:
            The path where the file was saved
        """
        if output_path is None:
            output_path = (
                self.config_loader.project_root
                / "sources"
                / self.source_name
                / "semantic.yaml"
            )
        else:
            output_path = Path(output_path)

        # Ensure directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        semantic_layer.save(str(output_path))
        print(f"[SemanticGenerator] Saved semantic layer to {output_path}")

        return str(output_path)

    def check_staleness(self) -> tuple[bool, str]:
        """
        Check if the existing semantic layer is stale.

        Returns:
            Tuple of (is_stale, message)
        """
        semantic_path = (
            self.config_loader.project_root
            / "sources"
            / self.source_name
            / "semantic.yaml"
        )

        if not semantic_path.exists():
            return True, "No semantic layer exists yet"

        try:
            existing = SemanticLayer.load(str(semantic_path))
        except Exception as e:
            return True, f"Failed to load existing semantic layer: {e}"

        current_hash = self.get_schema_hash()

        if existing.is_stale(current_hash):
            return True, f"Schema changed (old: {existing.schema_hash}, new: {current_hash})"

        return False, f"Up to date (hash: {current_hash})"


def generate_semantic_layer(
    source_name: str = "snowflake_saas",
    provider_name: str | None = None,
    force: bool = False,
) -> SemanticLayer:
    """
    Convenience function to generate and save a semantic layer.

    Args:
        source_name: Name of the data source
        provider_name: Optional LLM provider to use
        force: If True, regenerate even if not stale

    Returns:
        The generated SemanticLayer
    """
    generator = SemanticGenerator(source_name)

    # Check staleness
    is_stale, message = generator.check_staleness()
    if not is_stale and not force:
        print(f"[SemanticGenerator] {message}")
        print("[SemanticGenerator] Use --force to regenerate")
        # Load and return existing
        path = (
            generator.config_loader.project_root
            / "sources"
            / source_name
            / "semantic.yaml"
        )
        return SemanticLayer.load(str(path))

    print(f"[SemanticGenerator] {message}")

    # Generate new semantic layer
    semantic_layer = generator.generate(provider_name=provider_name)

    # Save it
    generator.save(semantic_layer)

    return semantic_layer
