"""
Templates router for dashboard templates and suggestions.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..dependencies import get_current_user
from ..models.user import User

# Add engine to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from engine.config_loader import get_config_loader

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateResponse(BaseModel):
    """Schema for a single template."""

    id: str
    name: str
    icon: str
    description: str
    prompt: str
    category_id: str
    category_name: str


class TemplatesListResponse(BaseModel):
    """Schema for templates list response."""

    templates: list[TemplateResponse]
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
