"""
Theme CRUD API endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.theme_storage import (
    save_theme, load_theme, list_themes, update_theme, delete_theme,
)

router = APIRouter(prefix="/themes", tags=["themes"])


class ThemeSaveRequest(BaseModel):
    name: str
    description: str = ""
    theme_data: dict


class ThemeUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    theme_data: dict | None = None


@router.get("/")
async def get_themes():
    """List all custom themes."""
    themes = list_themes()
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "theme_data": t.theme_data,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in themes
    ]


@router.get("/{theme_id}")
async def get_theme(theme_id: str):
    """Load a single theme."""
    theme = load_theme(theme_id)
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")
    return {
        "id": theme.id,
        "name": theme.name,
        "description": theme.description,
        "theme_data": theme.theme_data,
        "created_at": theme.created_at,
        "updated_at": theme.updated_at,
    }


@router.post("/")
async def create_theme(req: ThemeSaveRequest):
    """Create a new custom theme."""
    theme = save_theme(
        name=req.name,
        description=req.description,
        theme_data=req.theme_data,
    )
    return {
        "id": theme.id,
        "name": theme.name,
        "description": theme.description,
        "theme_data": theme.theme_data,
        "created_at": theme.created_at,
        "updated_at": theme.updated_at,
    }


@router.put("/{theme_id}")
async def put_theme(theme_id: str, req: ThemeUpdateRequest):
    """Update an existing theme."""
    fields = {}
    if req.name is not None:
        fields["name"] = req.name
    if req.description is not None:
        fields["description"] = req.description
    if req.theme_data is not None:
        fields["theme_data"] = req.theme_data

    theme = update_theme(theme_id, **fields)
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")
    return {
        "id": theme.id,
        "name": theme.name,
        "description": theme.description,
        "theme_data": theme.theme_data,
        "created_at": theme.created_at,
        "updated_at": theme.updated_at,
    }


@router.delete("/{theme_id}")
async def remove_theme(theme_id: str):
    """Delete a theme."""
    deleted = delete_theme(theme_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Theme not found")
    return {"deleted": True}
