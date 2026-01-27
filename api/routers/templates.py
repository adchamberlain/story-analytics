"""
Templates router for dashboard templates and suggestions.
"""

import sys
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..dependencies import get_current_user
from ..models.user import User

# Add engine to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from engine.config_loader import get_config_loader
from engine.semantic import SemanticLayer

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateResponse(BaseModel):
    """Schema for a single dashboard template."""

    id: str
    name: str
    icon: str
    description: str
    prompt: str
    category_id: str
    category_name: str


class ChartTemplateResponse(BaseModel):
    """Schema for a single chart template."""

    id: str
    name: str
    icon: str
    chart_type: str = "suggested"  # Default for semantic layer charts
    description: str
    prompt: str
    business_types: list[str] = []  # Optional, kept for backwards compatibility
    category_id: str = "suggested"
    category_name: str = "Suggested Charts"


class TemplatesListResponse(BaseModel):
    """Schema for templates list response."""

    templates: list[TemplateResponse]
    total: int


class ChartTemplatesListResponse(BaseModel):
    """Schema for chart templates list response."""

    templates: list[ChartTemplateResponse]
    total: int


class CategoryResponse(BaseModel):
    """Schema for a template category."""

    id: str
    name: str
    description: str | None = None


class CategoriesListResponse(BaseModel):
    """Schema for categories list response."""

    categories: list[CategoryResponse]


class SuggestionsResponse(BaseModel):
    """Schema for suggestions response."""

    suggestions: list[str]
    rotation_interval: int


@router.get("/", response_model=TemplatesListResponse)
async def list_templates(
    category: str | None = Query(None, description="Filter by category ID (saas, ecommerce, general)"),
    current_user: User = Depends(get_current_user),
):
    """
    List dashboard templates, optionally filtered by category.

    If no category is specified, returns templates for the user's business_type.
    """
    config = get_config_loader()

    # Use user's business_type if no category specified
    filter_category = category if category else current_user.business_type

    templates = config.get_templates_by_category(filter_category)

    return TemplatesListResponse(
        templates=[TemplateResponse(**t) for t in templates],
        total=len(templates),
    )


@router.get("/all", response_model=TemplatesListResponse)
async def list_all_templates(
    current_user: User = Depends(get_current_user),
):
    """List all dashboard templates across all categories."""
    config = get_config_loader()

    templates = config.get_templates_by_category(None)

    return TemplatesListResponse(
        templates=[TemplateResponse(**t) for t in templates],
        total=len(templates),
    )


@router.get("/categories", response_model=CategoriesListResponse)
async def list_categories(
    current_user: User = Depends(get_current_user),
):
    """List all template categories."""
    config = get_config_loader()

    categories = config.get_template_categories()

    return CategoriesListResponse(
        categories=[CategoryResponse(**c) for c in categories],
    )


@router.get("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(
    current_user: User = Depends(get_current_user),
):
    """Get input placeholder suggestions."""
    config = get_config_loader()

    return SuggestionsResponse(
        suggestions=config.get_suggestion_list(),
        rotation_interval=config.get_suggestion_rotation_interval(),
    )


# =============================================================================
# Chart Templates
# =============================================================================


@router.get("/charts", response_model=ChartTemplatesListResponse)
async def list_chart_templates(
    current_user: User = Depends(get_current_user),
):
    """
    List chart templates for the user's selected data source.

    Returns 6 suggested charts tailored to the user's preferred data source.
    Falls back to static business_type templates if no semantic layer charts exist.
    """
    source_name = current_user.preferred_source

    # Try to load from semantic layer first
    semantic_path = Path("sources") / source_name / "semantic.yaml"
    if semantic_path.exists():
        try:
            semantic = SemanticLayer.load(str(semantic_path))
            if semantic.suggested_charts:
                templates = [
                    ChartTemplateResponse(
                        id=chart.id,
                        name=chart.name,
                        icon=chart.icon,
                        chart_type="suggested",
                        description=chart.description,
                        prompt=chart.prompt,
                        business_types=[],
                        category_id="suggested",
                        category_name="Suggested Charts",
                    )
                    for chart in semantic.suggested_charts
                ]
                return ChartTemplatesListResponse(
                    templates=templates,
                    total=len(templates),
                )
        except Exception:
            # If loading fails, fall back to static templates
            pass

    # Fallback to static templates (for backwards compatibility)
    config = get_config_loader()
    templates = config.get_chart_templates_by_business_type(current_user.business_type)

    return ChartTemplatesListResponse(
        templates=[ChartTemplateResponse(**t) for t in templates],
        total=len(templates),
    )


@router.get("/charts/all", response_model=ChartTemplatesListResponse)
async def list_all_chart_templates(
    current_user: User = Depends(get_current_user),
):
    """List all chart templates across all business types."""
    config = get_config_loader()

    templates = config.get_chart_templates_by_business_type(None)

    return ChartTemplatesListResponse(
        templates=[ChartTemplateResponse(**t) for t in templates],
        total=len(templates),
    )


@router.get("/charts/categories", response_model=CategoriesListResponse)
async def list_chart_template_categories(
    current_user: User = Depends(get_current_user),
):
    """List chart template categories (funnel stages)."""
    config = get_config_loader()

    categories = config.get_chart_template_categories()

    return CategoriesListResponse(
        categories=[CategoryResponse(**c) for c in categories],
    )
