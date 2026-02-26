"""Admin-only endpoints for user management, invites, and settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.auth_simple import get_current_user
from api.services.metadata_db import (
    list_all_users, update_user_role, update_user_status,
    create_invite, list_invites, delete_invite,
    get_admin_setting, set_admin_setting,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Guard ────────────────────────────────────────────────────────────────────

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the current user to be an admin."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users")
async def get_users(user: dict = Depends(require_admin)):
    """List all users (admin only)."""
    return list_all_users()


class RoleUpdate(BaseModel):
    role: str


@router.put("/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    body: RoleUpdate,
    user: dict = Depends(require_admin),
):
    """Change a user's role (admin only). Cannot demote yourself."""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    if body.role not in ("admin", "editor"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'editor'")
    success = update_user_role(user_id, body.role)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, "role": body.role}


class StatusUpdate(BaseModel):
    active: bool


@router.put("/users/{user_id}/status")
async def change_user_status(
    user_id: str,
    body: StatusUpdate,
    user: dict = Depends(require_admin),
):
    """Activate or deactivate a user (admin only). Cannot deactivate yourself."""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    success = update_user_status(user_id, body.active)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, "is_active": body.active}


# ── Invites ──────────────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: str
    role: str = "editor"


@router.post("/invites")
async def create_invite_endpoint(
    body: InviteCreate,
    request: Request,
    user: dict = Depends(require_admin),
):
    """Create an invite link (admin only)."""
    if body.role not in ("admin", "editor"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'editor'")
    invite = create_invite(body.email, body.role, user["id"])
    base_url = str(request.base_url).rstrip("/")
    invite["invite_url"] = f"{base_url}/login?invite={invite['token']}"
    return invite


@router.get("/invites")
async def get_invites(user: dict = Depends(require_admin)):
    """List pending invites (admin only)."""
    return list_invites()


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, user: dict = Depends(require_admin)):
    """Revoke an invite (admin only)."""
    success = delete_invite(invite_id)
    if not success:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "deleted"}


# ── Admin Settings ───────────────────────────────────────────────────────────

ADMIN_SETTING_KEYS = {"open_registration"}


@router.get("/settings")
async def get_settings(user: dict = Depends(require_admin)):
    """Get admin settings."""
    return {key: get_admin_setting(key) for key in ADMIN_SETTING_KEYS}


@router.put("/settings")
async def update_settings(
    body: dict,
    user: dict = Depends(require_admin),
):
    """Update admin settings."""
    for key, value in body.items():
        if key in ADMIN_SETTING_KEYS:
            set_admin_setting(key, str(value))
    return {key: get_admin_setting(key) for key in ADMIN_SETTING_KEYS}
