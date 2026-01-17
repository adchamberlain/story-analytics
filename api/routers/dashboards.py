"""
Dashboard management router.
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..dependencies import get_current_user
from ..models.dashboard import Dashboard
from ..models.user import User
from pydantic import BaseModel
from ..schemas.dashboard import DashboardListResponse, DashboardResponse


class DashboardContentResponse(BaseModel):
    """Schema for dashboard content response."""
    slug: str
    title: str
    content: str
    url: str


class DashboardContentUpdate(BaseModel):
    """Schema for updating dashboard content."""
    content: str
    title: str | None = None

router = APIRouter(prefix="/dashboards", tags=["dashboards"])
settings = get_settings()


def dashboard_to_response(dashboard: Dashboard) -> DashboardResponse:
    """Convert dashboard model to response schema."""
    return DashboardResponse(
        id=dashboard.id,
        slug=dashboard.slug,
        title=dashboard.title,
        file_path=dashboard.file_path,
        url=f"{settings.evidence_base_url}/{dashboard.slug}",
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


@router.get("", response_model=DashboardListResponse)
async def list_dashboards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all dashboards for the current user."""
    dashboards = (
        db.query(Dashboard)
        .filter(Dashboard.user_id == current_user.id)
        .order_by(Dashboard.updated_at.desc())
        .all()
    )

    return DashboardListResponse(
        dashboards=[dashboard_to_response(d) for d in dashboards],
        total=len(dashboards),
    )


@router.get("/{slug}", response_model=DashboardResponse)
async def get_dashboard(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific dashboard by slug."""
    dashboard = (
        db.query(Dashboard)
        .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
        .first()
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found",
        )

    return dashboard_to_response(dashboard)


@router.get("/{slug}/content", response_model=DashboardContentResponse)
async def get_dashboard_content(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the raw markdown content of a dashboard."""
    dashboard = (
        db.query(Dashboard)
        .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
        .first()
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found",
        )

    file_path = Path(dashboard.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard file not found",
        )

    try:
        content = file_path.read_text()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dashboard file: {str(e)}",
        )

    return DashboardContentResponse(
        slug=dashboard.slug,
        title=dashboard.title,
        content=content,
        url=f"{settings.evidence_base_url}/{dashboard.slug}",
    )


@router.put("/{slug}/content", response_model=DashboardContentResponse)
async def update_dashboard_content(
    slug: str,
    update: DashboardContentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the markdown content of a dashboard."""
    dashboard = (
        db.query(Dashboard)
        .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
        .first()
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found",
        )

    file_path = Path(dashboard.file_path)

    try:
        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)
        # Write content
        file_path.write_text(update.content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write dashboard file: {str(e)}",
        )

    # Update title if provided
    if update.title:
        dashboard.title = update.title

    # Update timestamp
    from datetime import datetime
    dashboard.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(dashboard)

    return DashboardContentResponse(
        slug=dashboard.slug,
        title=dashboard.title,
        content=update.content,
        url=f"{settings.evidence_base_url}/{dashboard.slug}",
    )


@router.delete("/{slug}")
async def delete_dashboard(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a dashboard by slug."""
    dashboard = (
        db.query(Dashboard)
        .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
        .first()
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found",
        )

    # Delete the file if it exists
    file_path = Path(dashboard.file_path)
    if file_path.exists():
        os.remove(file_path)

    # Delete from database
    db.delete(dashboard)
    db.commit()

    return {"message": f"Dashboard '{slug}' deleted"}


@router.post("/sync")
async def sync_dashboards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sync dashboards from filesystem to database.
    Scans the pages directory and adds any new dashboards to the database.
    """
    pages_dir = Path(settings.pages_dir)
    if not pages_dir.exists():
        return {"message": "Pages directory not found", "synced": 0}

    synced = 0
    for md_file in pages_dir.glob("*.md"):
        slug = md_file.stem

        # Check if already in database for this user
        existing = (
            db.query(Dashboard)
            .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
            .first()
        )

        if not existing:
            # Read title from file (first line after stripping #)
            try:
                with open(md_file, "r") as f:
                    first_line = f.readline().strip()
                    title = first_line.lstrip("#").strip() or slug
            except Exception:
                title = slug

            dashboard = Dashboard(
                user_id=current_user.id,
                slug=slug,
                title=title,
                file_path=str(md_file),
            )
            db.add(dashboard)
            synced += 1

    db.commit()

    return {"message": f"Synced {synced} dashboards", "synced": synced}
