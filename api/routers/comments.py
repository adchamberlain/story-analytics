"""Comments endpoints for charts and dashboards."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user
from ..services.metadata_db import (
    create_comment,
    list_comments,
    update_comment,
    delete_comment,
)

router = APIRouter(prefix="/comments", tags=["comments"])


class CreateCommentRequest(BaseModel):
    chart_id: str | None = Field(None, examples=["abc123def456"])
    dashboard_id: str | None = Field(None, examples=["dash789abc"])
    parent_id: str | None = Field(None, description="Parent comment ID for threading")
    body: str = Field(..., examples=["Great visualization!"])


class UpdateCommentRequest(BaseModel):
    body: str = Field(..., examples=["Updated comment text"])


class CommentResponse(BaseModel):
    id: str
    chart_id: str | None
    dashboard_id: str | None
    parent_id: str | None
    author_id: str
    author_name: str | None = None
    body: str
    created_at: str
    updated_at: str | None
    deleted_at: str | None


@router.post("/", response_model=CommentResponse)
async def add_comment(request: CreateCommentRequest, user: dict = Depends(get_current_user)):
    """Add a comment to a chart or dashboard. Set parent_id for threaded replies."""
    if not request.chart_id and not request.dashboard_id:
        raise HTTPException(status_code=400, detail="Must specify chart_id or dashboard_id")
    comment = create_comment(
        chart_id=request.chart_id,
        dashboard_id=request.dashboard_id,
        parent_id=request.parent_id,
        author_id=user["id"],
        body=request.body,
    )
    return comment


@router.get("/")
async def get_comments(chart_id: str | None = None, dashboard_id: str | None = None):
    """List comments for a chart or dashboard."""
    if not chart_id and not dashboard_id:
        raise HTTPException(status_code=400, detail="Must specify chart_id or dashboard_id query param")
    return list_comments(chart_id=chart_id, dashboard_id=dashboard_id)


@router.put("/{comment_id}", response_model=CommentResponse)
async def edit_comment(comment_id: str, request: UpdateCommentRequest, user: dict = Depends(get_current_user)):
    """Edit a comment (author only)."""
    result = update_comment(comment_id, user["id"], request.body)
    if not result:
        raise HTTPException(status_code=404, detail="Comment not found or not authorized")
    return result


@router.delete("/{comment_id}")
async def remove_comment(comment_id: str, user: dict = Depends(get_current_user)):
    """Soft-delete a comment (author only)."""
    deleted = delete_comment(comment_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found or not authorized")
    return {"status": "deleted"}
