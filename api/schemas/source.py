"""
Schemas for data source and semantic layer API.
"""

from pydantic import BaseModel


class ColumnSemantic(BaseModel):
    """Semantic information about a database column."""

    name: str
    type: str
    nullable: bool
    description: str | None = None
    role: str | None = None  # primary_key, foreign_key, dimension, measure, date
    aggregation_hint: str | None = None
    business_meaning: str | None = None
    format_hint: str | None = None
    references: str | None = None  # For FKs: "table.column"


class TableSemantic(BaseModel):
    """Semantic information about a database table."""

    name: str
    description: str | None = None
    business_role: str | None = None
    columns: list[ColumnSemantic]
    row_count: int | None = None
    typical_questions: list[str] | None = None


class RelationshipSchema(BaseModel):
    """Relationship between two tables."""

    from_table: str
    from_column: str
    to_table: str
    to_column: str
    type: str  # one_to_one, one_to_many, many_to_one, many_to_many
    description: str | None = None


class BusinessContextSchema(BaseModel):
    """Business context for a data source."""

    description: str | None = None
    domain: str | None = None
    key_metrics: list[str] | None = None
    key_dimensions: list[str] | None = None
    business_glossary: dict[str, str] | None = None


class SemanticLayerResponse(BaseModel):
    """Response for semantic layer data."""

    source_name: str
    has_semantic_layer: bool
    tables: list[TableSemantic]
    relationships: list[RelationshipSchema]
    business_context: BusinessContextSchema | None = None
    schema_hash: str | None = None
    generated_at: str | None = None


class SemanticUpdateRequest(BaseModel):
    """Request to update semantic layer metadata."""

    table_name: str | None = None
    column_name: str | None = None
    updates: dict  # Partial updates to apply


class SourceInfoExtended(BaseModel):
    """Extended source info with semantic layer status."""

    name: str
    type: str
    connected: bool
    database: str | None = None
    schema_name: str | None = None
    has_semantic_layer: bool = False
    table_count: int | None = None
