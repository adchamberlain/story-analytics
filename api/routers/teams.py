"""Teams endpoints for collaboration."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from ..auth_simple import get_current_user
from ..config import get_settings
from ..email import send_team_invite_email, send_team_added_email
from ..services.metadata_db import (
    create_team, list_teams, get_team, get_team_members,
    add_team_member, remove_team_member, delete_team,
    get_user_by_email, get_team_member_role,
    create_invite, get_pending_team_invites, delete_invite,
)

router = APIRouter(prefix="/teams", tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str = Field(..., examples=["Data Team"])
    description: str | None = Field(None, examples=["Analytics and data visualization team"])


class AddMemberRequest(BaseModel):
    user_id: str = Field(..., examples=["abc123def456"])
    role: str = Field("member", examples=["member", "admin"])


class InviteRequest(BaseModel):
    email: str = Field(..., examples=["user@example.com"])


@router.post("/")
async def create(request: CreateTeamRequest, user: dict = Depends(get_current_user)):
    """Create a new team. The creator becomes the team admin."""
    return create_team(request.name, user["id"], request.description)


@router.get("/")
async def list_user_teams(user: dict = Depends(get_current_user)):
    """List teams the current user belongs to."""
    return list_teams(user["id"])


@router.get("/{team_id}")
async def get_team_detail(team_id: str, user: dict = Depends(get_current_user)):
    """Get team details. Caller must be a team member."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    role = get_team_member_role(team_id, user["id"])
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this team")
    team["members"] = get_team_members(team_id)
    return team


@router.post("/{team_id}/invite")
async def invite_member(team_id: str, request: InviteRequest, user: dict = Depends(get_current_user)):
    """Invite a user to a team by email.

    - If the user is already registered, add them directly and send a notification email.
    - If the user is not registered, create an invite token and send an invite email.
    Caller must be a team admin.
    """
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    caller_role = get_team_member_role(team_id, user["id"])
    if caller_role != "admin":
        raise HTTPException(status_code=403, detail="Only team admins can invite members")

    target_user = get_user_by_email(request.email)
    settings = get_settings()
    inviter_name = user.get("display_name") or user.get("email", "A team admin")

    if target_user:
        # User is registered — add directly
        existing_role = get_team_member_role(team_id, target_user["id"])
        if existing_role is not None:
            raise HTTPException(status_code=409, detail="User is already a team member")
        add_team_member(team_id, target_user["id"], "member")
        email_sent = send_team_added_email(request.email, team["name"], settings.frontend_base_url, inviter_name)
        if not email_sent:
            logger.error("Failed to send team-added notification email to %s for team %s", request.email, team_id)
            raise HTTPException(status_code=502, detail="Member was added to the team but the notification email failed to send")
        return {"status": "added", "message": f"{request.email} has been added to the team"}
    else:
        # User is NOT registered — create invite token
        invite = create_invite(
            email=request.email,
            role="editor",
            created_by=user["id"],
            team_id=team_id,
            team_role="member",
        )
        invite_url = f"{settings.frontend_base_url}/login?invite={invite['token']}"
        email_sent = send_team_invite_email(request.email, team["name"], invite_url, inviter_name)
        if not email_sent:
            logger.error("Failed to send team invite email to %s for team %s", request.email, team_id)
            raise HTTPException(status_code=502, detail="Invite was created but the email failed to send. Please try again.")
        return {"status": "invited", "message": f"Invite sent to {request.email}", "invite_url": invite_url}


@router.post("/{team_id}/members")
async def add_member(team_id: str, request: AddMemberRequest, user: dict = Depends(get_current_user)):
    """Add a member to a team. Caller must be a team admin."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    caller_role = get_team_member_role(team_id, user["id"])
    if caller_role != "admin":
        raise HTTPException(status_code=403, detail="Only team admins can add members")
    return add_team_member(team_id, request.user_id, request.role)


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(team_id: str, user_id: str, user: dict = Depends(get_current_user)):
    """Remove a member from a team. Caller must be admin. Cannot remove the owner."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    caller_role = get_team_member_role(team_id, user["id"])
    if caller_role != "admin":
        raise HTTPException(status_code=403, detail="Only team admins can remove members")
    if user_id == team["owner_id"]:
        raise HTTPException(status_code=403, detail="Cannot remove the team owner")
    removed = remove_team_member(team_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"status": "removed"}


@router.get("/{team_id}/invites")
async def list_invites(team_id: str, user: dict = Depends(get_current_user)):
    """List pending invites for a team. Caller must be a team admin."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    caller_role = get_team_member_role(team_id, user["id"])
    if caller_role != "admin":
        raise HTTPException(status_code=403, detail="Only team admins can view invites")
    return get_pending_team_invites(team_id)


@router.delete("/{team_id}/invites/{invite_id}")
async def cancel_invite(team_id: str, invite_id: str, user: dict = Depends(get_current_user)):
    """Cancel a pending invite. Caller must be a team admin."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    caller_role = get_team_member_role(team_id, user["id"])
    if caller_role != "admin":
        raise HTTPException(status_code=403, detail="Only team admins can cancel invites")
    deleted = delete_invite(invite_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "cancelled"}


@router.delete("/{team_id}")
async def delete(team_id: str, user: dict = Depends(get_current_user)):
    """Delete a team (owner only)."""
    deleted = delete_team(team_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Team not found or not authorized")
    return {"status": "deleted"}
