"""
Data source management router.
"""

import os
from pathlib import Path
from typing import Any

import yaml
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..schemas.source import (
    ColumnSemantic,
    TableSemantic,
    RelationshipSchema,
    BusinessContextSchema,
    SemanticLayerResponse,
    SemanticUpdateRequest,
    SourceInfoExtended,
)

router = APIRouter(prefix="/sources", tags=["sources"])


class SnowflakeConnection(BaseModel):
    """Schema for Snowflake connection."""

    account: str
    username: str
    password: str
    warehouse: str
    database: str
    schema_name: str  # 'schema' is reserved


class ConnectionTest(BaseModel):
    """Schema for connection test result."""

    success: bool
    message: str
    tables: list[str] | None = None


class SourceInfo(BaseModel):
    """Schema for source information (deprecated, use SourceInfoExtended)."""

    name: str
    type: str
    connected: bool
    database: str | None = None
    schema_name: str | None = None


def get_encryption_key() -> bytes:
    """Get or create encryption key for credentials."""
    key_path = Path("data/.encryption_key")
    key_path.parent.mkdir(parents=True, exist_ok=True)

    if key_path.exists():
        return key_path.read_bytes()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        # Make file readable only by owner
        os.chmod(key_path, 0o600)
        return key


def encrypt_password(password: str) -> str:
    """Encrypt a password."""
    f = Fernet(get_encryption_key())
    return f.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    """Decrypt a password."""
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted.encode()).decode()


@router.get("", response_model=list[SourceInfoExtended])
async def list_sources(current_user: User = Depends(get_current_user)):
    """List available data sources with semantic layer status."""
    sources = []
    sources_dir = Path("sources")

    if sources_dir.exists():
        for source_dir in sources_dir.iterdir():
            if source_dir.is_dir():
                connection_file = source_dir / "connection.yaml"
                semantic_file = source_dir / "semantic.yaml"

                source_info = SourceInfoExtended(
                    name=source_dir.name,
                    type="snowflake" if "snowflake" in source_dir.name else "unknown",
                    connected=connection_file.exists(),
                    has_semantic_layer=semantic_file.exists(),
                )

                # Try to read connection details
                if connection_file.exists():
                    try:
                        with open(connection_file) as f:
                            config = yaml.safe_load(f)
                            options = config.get("options", {})
                            source_info.database = options.get("database")
                            source_info.schema_name = options.get("schema")
                    except Exception:
                        pass

                # Get table count from semantic layer if available
                if semantic_file.exists():
                    try:
                        with open(semantic_file) as f:
                            semantic_data = yaml.safe_load(f)
                            tables = semantic_data.get("tables", {})
                            source_info.table_count = len(tables)
                    except Exception:
                        pass

                sources.append(source_info)

    return sources


@router.get("/{source_name}/semantic", response_model=SemanticLayerResponse)
async def get_semantic_layer(
    source_name: str,
    current_user: User = Depends(get_current_user),
):
    """Get semantic layer for a source, including tables, columns, and relationships."""
    source_dir = Path("sources") / source_name
    semantic_file = source_dir / "semantic.yaml"
    connection_file = source_dir / "connection.yaml"

    if not source_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found",
        )

    tables: list[TableSemantic] = []
    relationships: list[RelationshipSchema] = []
    business_context: BusinessContextSchema | None = None
    schema_hash: str | None = None
    generated_at: str | None = None

    # Load semantic layer if it exists
    if semantic_file.exists():
        try:
            with open(semantic_file) as f:
                semantic_data = yaml.safe_load(f)

            schema_hash = semantic_data.get("schema_hash")
            generated_at = semantic_data.get("generated_at")

            # Parse business context
            bc_data = semantic_data.get("business_context", {})
            if bc_data:
                business_context = BusinessContextSchema(
                    description=bc_data.get("description"),
                    domain=bc_data.get("domain"),
                    key_metrics=bc_data.get("key_metrics"),
                    key_dimensions=bc_data.get("key_dimensions"),
                    business_glossary=bc_data.get("business_glossary"),
                )

            # Parse tables
            for table_name, table_data in semantic_data.get("tables", {}).items():
                columns = []
                for col_name, col_data in table_data.get("columns", {}).items():
                    columns.append(
                        ColumnSemantic(
                            name=col_name,
                            type="",  # Will be filled from schema if available
                            nullable=True,
                            description=col_data.get("description"),
                            role=col_data.get("role"),
                            aggregation_hint=col_data.get("aggregation_hint"),
                            business_meaning=col_data.get("business_meaning"),
                            format_hint=col_data.get("format_hint"),
                            references=col_data.get("references"),
                        )
                    )

                tables.append(
                    TableSemantic(
                        name=table_name,
                        description=table_data.get("description"),
                        business_role=table_data.get("business_role"),
                        columns=columns,
                        typical_questions=table_data.get("typical_questions"),
                    )
                )

            # Parse relationships
            for rel_data in semantic_data.get("relationships", []):
                from_parts = rel_data.get("from", ".").split(".")
                to_parts = rel_data.get("to", ".").split(".")
                relationships.append(
                    RelationshipSchema(
                        from_table=from_parts[0] if len(from_parts) > 1 else "",
                        from_column=from_parts[1] if len(from_parts) > 1 else from_parts[0],
                        to_table=to_parts[0] if len(to_parts) > 1 else "",
                        to_column=to_parts[1] if len(to_parts) > 1 else to_parts[0],
                        type=rel_data.get("type", "many_to_one"),
                        description=rel_data.get("description"),
                    )
                )

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to parse semantic layer: {str(e)}",
            )

    # Merge with live schema data if available (to get column types)
    if connection_file.exists():
        try:
            # Try to get column types from cached parquet files
            data_dir = Path("data") / source_name
            if data_dir.exists():
                import duckdb

                conn = duckdb.connect(":memory:")
                for table in tables:
                    parquet_file = data_dir / f"{table.name.lower()}.parquet"
                    if parquet_file.exists():
                        # Get column info from parquet
                        result = conn.execute(
                            f"DESCRIBE SELECT * FROM read_parquet('{parquet_file}')"
                        ).fetchall()
                        col_types = {row[0].upper(): row[1] for row in result}

                        # Update column types
                        for col in table.columns:
                            if col.name.upper() in col_types:
                                col.type = col_types[col.name.upper()]
                conn.close()
        except Exception:
            # Ignore errors - we still have the semantic data
            pass

    return SemanticLayerResponse(
        source_name=source_name,
        has_semantic_layer=semantic_file.exists(),
        tables=tables,
        relationships=relationships,
        business_context=business_context,
        schema_hash=schema_hash,
        generated_at=generated_at,
    )


@router.patch("/{source_name}/semantic")
async def update_semantic_layer(
    source_name: str,
    request: SemanticUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """Update semantic layer metadata for a table or column."""
    source_dir = Path("sources") / source_name
    semantic_file = source_dir / "semantic.yaml"

    if not source_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found",
        )

    if not semantic_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Semantic layer not found for source '{source_name}'",
        )

    try:
        # Load existing semantic layer
        with open(semantic_file) as f:
            semantic_data = yaml.safe_load(f)

        # Apply updates
        if request.table_name:
            if request.table_name not in semantic_data.get("tables", {}):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Table '{request.table_name}' not found",
                )

            if request.column_name:
                # Update column
                columns = semantic_data["tables"][request.table_name].get("columns", {})
                if request.column_name not in columns:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Column '{request.column_name}' not found in table '{request.table_name}'",
                    )

                for key, value in request.updates.items():
                    if value is None:
                        columns[request.column_name].pop(key, None)
                    else:
                        columns[request.column_name][key] = value
            else:
                # Update table
                for key, value in request.updates.items():
                    if key == "columns":
                        continue  # Don't allow bulk column updates this way
                    if value is None:
                        semantic_data["tables"][request.table_name].pop(key, None)
                    else:
                        semantic_data["tables"][request.table_name][key] = value
        else:
            # Update business context or top-level fields
            if "business_context" in request.updates:
                bc_updates = request.updates["business_context"]
                if "business_context" not in semantic_data:
                    semantic_data["business_context"] = {}
                for key, value in bc_updates.items():
                    if value is None:
                        semantic_data["business_context"].pop(key, None)
                    else:
                        semantic_data["business_context"][key] = value

        # Save updated semantic layer
        with open(semantic_file, "w") as f:
            yaml.dump(semantic_data, f, default_flow_style=False, sort_keys=False)

        return {"success": True, "message": "Semantic layer updated"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update semantic layer: {str(e)}",
        )


class SemanticGenerateRequest(BaseModel):
    """Request to generate semantic layer."""

    provider: str | None = None  # claude, openai, gemini
    force: bool = False  # Force regeneration even if not stale


class SemanticGenerateResponse(BaseModel):
    """Response from semantic layer generation."""

    success: bool
    message: str
    tables_count: int | None = None
    relationships_count: int | None = None
    domain: str | None = None


@router.post("/{source_name}/semantic/generate", response_model=SemanticGenerateResponse)
async def generate_semantic_layer(
    source_name: str,
    request: SemanticGenerateRequest = SemanticGenerateRequest(),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a semantic layer for a source using AI analysis.

    This analyzes the database schema and sample data to generate:
    - Table and column descriptions
    - Business context and domain identification
    - Column roles (primary key, foreign key, dimension, measure, date)
    - Relationships between tables
    - Common query patterns
    """
    source_dir = Path("sources") / source_name

    if not source_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found",
        )

    # Check if connection exists
    connection_file = source_dir / "connection.yaml"
    if not connection_file.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No connection configured for source '{source_name}'",
        )

    try:
        from engine.semantic_generator import SemanticGenerator

        generator = SemanticGenerator(source_name)

        # Check staleness
        is_stale, message = generator.check_staleness()

        if not is_stale and not request.force:
            # Load existing and return info
            semantic_path = source_dir / "semantic.yaml"
            with open(semantic_path) as f:
                data = yaml.safe_load(f)

            return SemanticGenerateResponse(
                success=True,
                message="Semantic layer already exists and is up to date",
                tables_count=len(data.get("tables", {})),
                relationships_count=len(data.get("relationships", [])),
                domain=data.get("business_context", {}).get("domain"),
            )

        # Generate new semantic layer
        semantic_layer = generator.generate(provider_name=request.provider)

        # Save it
        generator.save(semantic_layer)

        return SemanticGenerateResponse(
            success=True,
            message="Semantic layer generated successfully",
            tables_count=len(semantic_layer.tables),
            relationships_count=len(semantic_layer.relationships),
            domain=semantic_layer.business_context.domain,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate semantic layer: {str(e)}",
        )


class SemanticEnhanceRequest(BaseModel):
    """Request to enhance semantic layer with user business context."""

    user_context: str  # User's business context (any format)
    preview: bool = True  # If True, return proposed changes without applying


class SemanticChange(BaseModel):
    """A single change to apply to the semantic layer."""

    path: str  # e.g., "tables.CUSTOMERS.description" or "business_context.key_metrics"
    action: str  # "add", "update", "enhance"
    current_value: Any | None = None
    new_value: Any


class SemanticEnhanceResponse(BaseModel):
    """Response from semantic layer enhancement."""

    success: bool
    message: str
    changes: list[SemanticChange] | None = None
    summary: dict | None = None  # metrics_added, terms_added, etc.
    applied: bool = False  # Whether changes were applied


@router.post("/{source_name}/semantic/enhance", response_model=SemanticEnhanceResponse)
async def enhance_semantic_layer(
    source_name: str,
    request: SemanticEnhanceRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Enhance semantic layer with user-provided business context.

    This endpoint accepts business context in various formats:
    - YAML/JSON (dbt, Looker, custom semantic layers)
    - Markdown documentation
    - Plain text definitions
    - SQL queries with comments

    The LLM parses the input and intelligently merges it with the existing
    semantic layer, preserving existing content while adding new information.

    Set preview=True (default) to see proposed changes before applying.
    Set preview=False to apply changes immediately.
    """
    source_dir = Path("sources") / source_name
    semantic_file = source_dir / "semantic.yaml"

    if not source_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found",
        )

    if not semantic_file.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No semantic layer exists for source '{source_name}'. Generate one first.",
        )

    try:
        # Load current semantic layer
        with open(semantic_file) as f:
            current_semantic = yaml.safe_load(f)

        # Load the enhance prompt
        from engine.config_loader import get_config_loader
        from engine.llm.claude import get_provider

        config_loader = get_config_loader()
        llm = get_provider()

        # Load enhance prompt template
        enhance_prompt_path = Path("engine/prompts/semantic/enhance.yaml")
        with open(enhance_prompt_path) as f:
            prompt_config = yaml.safe_load(f)

        # Format current semantic layer as YAML for the prompt
        current_yaml = yaml.dump(current_semantic, default_flow_style=False, sort_keys=False)

        # Build the prompt
        system_prompt = prompt_config["system_prompt"] + "\n\n" + prompt_config["instructions"]
        user_prompt = prompt_config["user_prompt_template"].format(
            current_semantic_layer=current_yaml,
            user_context=request.user_context,
        )

        # Call LLM
        from engine.llm.base import Message

        response = llm.generate(
            messages=[Message(role="user", content=user_prompt)],
            system_prompt=system_prompt,
            temperature=0.3,
        )

        # Parse LLM response (extract YAML from response)
        response_text = response.content
        changes_yaml = None

        # Try to extract YAML from code block
        if "```yaml" in response_text:
            start = response_text.find("```yaml") + 7
            end = response_text.find("```", start)
            if end > start:
                changes_yaml = response_text[start:end].strip()
        elif "```" in response_text:
            start = response_text.find("```") + 3
            end = response_text.find("```", start)
            if end > start:
                changes_yaml = response_text[start:end].strip()
        else:
            # Try to parse entire response as YAML
            changes_yaml = response_text.strip()

        if not changes_yaml:
            return SemanticEnhanceResponse(
                success=False,
                message="Could not parse LLM response",
            )

        # Parse the changes YAML
        try:
            changes_data = yaml.safe_load(changes_yaml)
        except yaml.YAMLError as e:
            return SemanticEnhanceResponse(
                success=False,
                message=f"Invalid YAML in LLM response: {str(e)}",
            )

        # Extract changes and summary
        changes_section = changes_data.get("changes", {})
        summary = changes_data.get("summary", {})

        # Build list of SemanticChange objects for preview
        changes_list: list[SemanticChange] = []

        # Process business_context changes
        bc_changes = changes_section.get("business_context", {})
        for field, field_changes in bc_changes.items():
            if isinstance(field_changes, dict):
                if "add" in field_changes:
                    for item in field_changes.get("add", []) if isinstance(field_changes["add"], list) else [field_changes["add"]]:
                        changes_list.append(SemanticChange(
                            path=f"business_context.{field}",
                            action="add",
                            new_value=item,
                        ))
                if "update" in field_changes:
                    for key, value in field_changes["update"].items():
                        current = current_semantic.get("business_context", {}).get(field, {}).get(key) if isinstance(current_semantic.get("business_context", {}).get(field), dict) else None
                        changes_list.append(SemanticChange(
                            path=f"business_context.{field}.{key}",
                            action="update",
                            current_value=current,
                            new_value=value,
                        ))

        # Process table changes
        table_changes = changes_section.get("tables", {})
        for table_name, table_updates in table_changes.items():
            if not isinstance(table_updates, dict):
                continue

            for field, value in table_updates.items():
                if field == "columns" and isinstance(value, dict):
                    for col_name, col_updates in value.items():
                        if isinstance(col_updates, dict):
                            for col_field, col_value in col_updates.items():
                                if col_value is not None:
                                    current = current_semantic.get("tables", {}).get(table_name, {}).get("columns", {}).get(col_name, {}).get(col_field)
                                    changes_list.append(SemanticChange(
                                        path=f"tables.{table_name}.columns.{col_name}.{col_field}",
                                        action="update" if current else "add",
                                        current_value=current,
                                        new_value=col_value,
                                    ))
                elif field == "typical_questions" and isinstance(value, dict) and "add" in value:
                    for q in value["add"]:
                        changes_list.append(SemanticChange(
                            path=f"tables.{table_name}.typical_questions",
                            action="add",
                            new_value=q,
                        ))
                elif value is not None:
                    current = current_semantic.get("tables", {}).get(table_name, {}).get(field)
                    changes_list.append(SemanticChange(
                        path=f"tables.{table_name}.{field}",
                        action="update" if current else "add",
                        current_value=current,
                        new_value=value,
                    ))

        # Process query_patterns changes
        qp_changes = changes_section.get("query_patterns", {})
        if "add" in qp_changes:
            for pattern_name, pattern_data in qp_changes["add"].items():
                changes_list.append(SemanticChange(
                    path=f"query_patterns.{pattern_name}",
                    action="add",
                    new_value=pattern_data,
                ))
        if "update" in qp_changes:
            for pattern_name, pattern_data in qp_changes["update"].items():
                current = current_semantic.get("query_patterns", {}).get(pattern_name)
                changes_list.append(SemanticChange(
                    path=f"query_patterns.{pattern_name}",
                    action="update",
                    current_value=current,
                    new_value=pattern_data,
                ))

        # If not preview mode, apply the changes
        applied = False
        if not request.preview and changes_list:
            # Apply changes to semantic layer
            _apply_semantic_changes(current_semantic, changes_section)

            # Save updated semantic layer
            with open(semantic_file, "w") as f:
                yaml.dump(current_semantic, f, default_flow_style=False, sort_keys=False)

            applied = True

        return SemanticEnhanceResponse(
            success=True,
            message=f"Found {len(changes_list)} changes to apply" if request.preview else f"Applied {len(changes_list)} changes",
            changes=changes_list,
            summary=summary,
            applied=applied,
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enhance semantic layer: {str(e)}",
        )


def _apply_semantic_changes(semantic_data: dict, changes: dict) -> None:
    """Apply changes from the LLM to the semantic layer data structure."""

    # Apply business_context changes
    bc_changes = changes.get("business_context", {})
    if bc_changes:
        if "business_context" not in semantic_data:
            semantic_data["business_context"] = {}

        for field, field_changes in bc_changes.items():
            if isinstance(field_changes, dict):
                # Handle add/update structure
                if "add" in field_changes:
                    items_to_add = field_changes["add"]
                    if field not in semantic_data["business_context"]:
                        if isinstance(items_to_add, list):
                            semantic_data["business_context"][field] = []
                        elif isinstance(items_to_add, dict):
                            semantic_data["business_context"][field] = {}

                    if isinstance(items_to_add, list):
                        for item in items_to_add:
                            if item not in semantic_data["business_context"][field]:
                                semantic_data["business_context"][field].append(item)
                    elif isinstance(items_to_add, dict):
                        semantic_data["business_context"][field].update(items_to_add)

                if "update" in field_changes:
                    if field not in semantic_data["business_context"]:
                        semantic_data["business_context"][field] = {}
                    semantic_data["business_context"][field].update(field_changes["update"])
            else:
                # Direct value update
                semantic_data["business_context"][field] = field_changes

    # Apply table changes
    table_changes = changes.get("tables", {})
    for table_name, table_updates in table_changes.items():
        if not isinstance(table_updates, dict):
            continue

        if table_name not in semantic_data.get("tables", {}):
            continue  # Skip tables that don't exist

        for field, value in table_updates.items():
            if field == "columns" and isinstance(value, dict):
                for col_name, col_updates in value.items():
                    if col_name not in semantic_data["tables"][table_name].get("columns", {}):
                        continue  # Skip columns that don't exist

                    if isinstance(col_updates, dict):
                        for col_field, col_value in col_updates.items():
                            if col_value is not None:
                                semantic_data["tables"][table_name]["columns"][col_name][col_field] = col_value

            elif field == "typical_questions" and isinstance(value, dict) and "add" in value:
                if "typical_questions" not in semantic_data["tables"][table_name]:
                    semantic_data["tables"][table_name]["typical_questions"] = []
                for q in value["add"]:
                    if q not in semantic_data["tables"][table_name]["typical_questions"]:
                        semantic_data["tables"][table_name]["typical_questions"].append(q)

            elif value is not None:
                semantic_data["tables"][table_name][field] = value

    # Apply query_patterns changes
    qp_changes = changes.get("query_patterns", {})
    if qp_changes:
        if "query_patterns" not in semantic_data:
            semantic_data["query_patterns"] = {}

        if "add" in qp_changes:
            for pattern_name, pattern_data in qp_changes["add"].items():
                semantic_data["query_patterns"][pattern_name] = pattern_data

        if "update" in qp_changes:
            for pattern_name, pattern_data in qp_changes["update"].items():
                if pattern_name in semantic_data["query_patterns"]:
                    semantic_data["query_patterns"][pattern_name].update(pattern_data)
                else:
                    semantic_data["query_patterns"][pattern_name] = pattern_data


@router.post("/snowflake/test", response_model=ConnectionTest)
async def test_snowflake_connection(
    connection: SnowflakeConnection,
    current_user: User = Depends(get_current_user),
):
    """Test a Snowflake connection."""
    try:
        import snowflake.connector

        conn = snowflake.connector.connect(
            account=connection.account,
            user=connection.username,
            password=connection.password,
            warehouse=connection.warehouse,
            database=connection.database,
            schema=connection.schema_name,
        )

        # Try to list tables
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[1] for row in cursor.fetchall()]
        cursor.close()
        conn.close()

        return ConnectionTest(
            success=True,
            message=f"Connected successfully. Found {len(tables)} tables.",
            tables=tables[:20],  # Limit to first 20
        )

    except Exception as e:
        return ConnectionTest(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


@router.post("/snowflake/save")
async def save_snowflake_connection(
    connection: SnowflakeConnection,
    source_name: str = "snowflake_saas",
    current_user: User = Depends(get_current_user),
):
    """Save a Snowflake connection configuration."""
    source_dir = Path("sources") / source_name
    source_dir.mkdir(parents=True, exist_ok=True)

    # Create connection.yaml (don't store password in plaintext)
    connection_config = {
        "options": {
            "account": connection.account,
            "username": connection.username,
            "password": connection.password,  # In production, use encrypted storage
            "warehouse": connection.warehouse,
            "database": connection.database,
            "schema": connection.schema_name,
        }
    }

    connection_file = source_dir / "connection.yaml"
    with open(connection_file, "w") as f:
        yaml.dump(connection_config, f, default_flow_style=False)

    # Make file readable only by owner
    os.chmod(connection_file, 0o600)

    return {"message": f"Connection saved to {source_name}"}


@router.get("/{source_name}/schema")
async def get_source_schema(
    source_name: str,
    current_user: User = Depends(get_current_user),
):
    """Get schema information for a source."""
    source_dir = Path("sources") / source_name
    connection_file = source_dir / "connection.yaml"

    if not connection_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found or not configured",
        )

    try:
        with open(connection_file) as f:
            config = yaml.safe_load(f)
            options = config.get("options", {})

        import snowflake.connector

        conn = snowflake.connector.connect(
            account=options["account"],
            user=options["username"],
            password=options["password"],
            warehouse=options["warehouse"],
            database=options["database"],
            schema=options["schema"],
        )

        cursor = conn.cursor()

        # Get tables
        cursor.execute("SHOW TABLES")
        tables = []
        for row in cursor.fetchall():
            table_name = row[1]

            # Get columns for this table
            cursor.execute(f"DESCRIBE TABLE {table_name}")
            columns = [
                {
                    "name": col[0],
                    "type": col[1],
                    "nullable": col[3] == "Y",
                }
                for col in cursor.fetchall()
            ]

            tables.append(
                {
                    "name": table_name,
                    "columns": columns,
                }
            )

        cursor.close()
        conn.close()

        return {
            "source": source_name,
            "database": options["database"],
            "schema": options["schema"],
            "tables": tables,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get schema: {str(e)}",
        )
