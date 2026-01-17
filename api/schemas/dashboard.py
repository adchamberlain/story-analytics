"""
Dashboard-related Pydantic schemas.
"""

from datetime import datetime

from pydantic import BaseModel


class DashboardResponse(BaseModel):
    """Schema for dashboard response."""

    id: int
    slug: str
    title: str
    file_path: str
    url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DashboardListResponse(BaseModel):
    """Schema for list of dashboards."""

    dashboards: list[DashboardResponse]
    total: int
