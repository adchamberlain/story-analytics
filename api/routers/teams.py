"""Teams endpoints for collaboration."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user
from ..services.metadata_db import (
    create_team, list_teams, get_team, get_team_members,
    add_team_member, remove_team_member, delete_team,
)

router = APIRouter(prefix="/teams", tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str = Field(..., examples=["Data Team"])
    description: str | None = Field(None, examples=["Analytics and data visualization team"])


class AddMemberRequest(BaseModel):
    user_id: str = Field(..., examples=["abc123def456"])
    role: str = Field("member", examples=["member", "admin"])


@router.post("/")
async def create(request: CreateTeamRequest, user: dict = Depends(get_current_user)):
    """Create a new team. The creator becomes the team admin."""
    return create_team(request.name, user["id"], request.description)


@router.get("/")
async def list_user_teams(user: dict = Depends(get_current_user)):
    """List teams the current user belongs to."""
    return list_teams(user["id"])


@router.get("/{team_id}")
async def get_team_detail(team_id: str):
    """Get team details."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team["members"] = get_team_members(team_id)
    return team


@router.post("/{team_id}/members")
async def add_member(team_id: str, request: AddMemberRequest, user: dict = Depends(get_current_user)):
    """Add a member to a team."""
    team = get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return add_team_member(team_id, request.user_id, request.role)


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(team_id: str, user_id: str, user: dict = Depends(get_current_user)):
    """Remove a member from a team."""
    removed = remove_team_member(team_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"status": "removed"}


@router.delete("/{team_id}")
async def delete(team_id: str, user: dict = Depends(get_current_user)):
    """Delete a team (owner only)."""
    deleted = delete_team(team_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Team not found or not authorized")
    return {"status": "deleted"}
