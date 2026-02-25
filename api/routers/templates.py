"""
Templates router: CRUD for chart templates.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user
from ..services.template_storage import (
    save_template, load_template, list_templates, update_template, delete_template,
)

router = APIRouter(prefix="/v2/templates", tags=["templates"])


# ── Schemas ────────────────────────────────────────────────────────────────


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., examples=["Sales Bar Chart"], description="Template name")
    description: str = Field(..., examples=["Standard sales bar chart template"], description="Template description")
    chart_type: str = Field(..., examples=["BarChart", "LineChart"], description="Chart type this template applies to")
    config: dict = Field(..., description="Chart configuration to save as template")


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    chart_type: str | None = None
    config: dict | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    chart_type: str
    config: dict
    created_at: str
    updated_at: str


def _to_response(t) -> TemplateResponse:
    return TemplateResponse(
        id=t.id,
        name=t.name,
        description=t.description,
        chart_type=t.chart_type,
        config=t.config,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/", response_model=list[TemplateResponse])
async def list_all(user: dict = Depends(get_current_user)):
    """List all saved templates."""
    return [_to_response(t) for t in list_templates()]


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: str, user: dict = Depends(get_current_user)):
    """Get a single template."""
    t = load_template(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_response(t)


@router.post("/", response_model=TemplateResponse)
async def create_template(request: CreateTemplateRequest, user: dict = Depends(get_current_user)):
    """Create a new template."""
    t = save_template(
        name=request.name,
        description=request.description,
        chart_type=request.chart_type,
        config=request.config,
    )
    return _to_response(t)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update(template_id: str, request: UpdateTemplateRequest, user: dict = Depends(get_current_user)):
    """Update a template."""
    fields = request.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    t = update_template(template_id, **fields)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_response(t)


@router.delete("/{template_id}")
async def remove_template(template_id: str, user: dict = Depends(get_current_user)):
    """Delete a template."""
    if not delete_template(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"deleted": True}
