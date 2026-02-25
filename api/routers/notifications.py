"""Notification endpoints."""

from fastapi import APIRouter, Depends

from ..auth_simple import get_current_user
from ..services.metadata_db import (
    list_notifications, get_unread_count,
    mark_notification_read, mark_all_notifications_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
async def list_notifs(user: dict = Depends(get_current_user)):
    """List recent notifications."""
    return list_notifications(user["id"])


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    """Get count of unread notifications."""
    return {"count": get_unread_count(user["id"])}


@router.put("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a notification as read."""
    mark_notification_read(notification_id, user["id"])
    return {"status": "read"}


@router.put("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    count = mark_all_notifications_read(user["id"])
    return {"marked": count}
