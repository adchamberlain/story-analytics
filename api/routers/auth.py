"""
Authentication router with passwordless (magic link) authentication.
"""

import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..dependencies import get_current_user
from ..email import send_magic_link_email
from ..models.magic_link import MagicLink
from ..models.user import User
from ..schemas.user import Token, UserPreferences, UserResponse
from ..security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class MagicLinkRequest(BaseModel):
    """Request to send a magic link."""

    email: EmailStr
    name: str | None = None  # Optional name for new users


class MagicLinkResponse(BaseModel):
    """Response after requesting a magic link."""

    message: str
    email: str


class VerifyResponse(BaseModel):
    """Response after verifying a magic link."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/magic-link", response_model=MagicLinkResponse)
async def request_magic_link(
    request: MagicLinkRequest,
    db: Session = Depends(get_db),
):
    """
    Request a magic link for passwordless login.

    If the email doesn't exist, a new account will be created.
    """
    email = request.email.lower()

    # Check if user exists
    user = db.query(User).filter(User.email == email).first()
    is_new_user = user is None

    if is_new_user:
        # Create new user
        name = request.name or email.split("@")[0]  # Default name from email
        user = User(email=email, name=name)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Invalidate any existing magic links for this email
    db.query(MagicLink).filter(
        MagicLink.email == email,
        MagicLink.used == False,
    ).update({"used": True})

    # Create new magic link
    magic_link = MagicLink.create(email=email, expires_minutes=15)
    db.add(magic_link)
    db.commit()

    # Build the verification URL
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3001")
    verify_url = f"{frontend_url}/auth/verify?token={magic_link.token}"

    # Send email
    send_magic_link_email(
        to_email=email,
        magic_link_url=verify_url,
        is_new_user=is_new_user,
    )

    return MagicLinkResponse(
        message="Magic link sent! Check your email.",
        email=email,
    )


@router.get("/verify")
async def verify_magic_link(
    token: str = Query(..., description="Magic link token"),
    db: Session = Depends(get_db),
):
    """
    Verify a magic link token and return a JWT.

    This endpoint is called when the user clicks the link in their email.
    """
    # Find the magic link
    magic_link = db.query(MagicLink).filter(MagicLink.token == token).first()

    if not magic_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link",
        )

    if not magic_link.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This link has expired or already been used",
        )

    # Mark as used
    magic_link.used = True
    db.commit()

    # Find the user
    user = db.query(User).filter(User.email == magic_link.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Create access token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    return VerifyResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout():
    """
    Logout the current user.

    Note: JWT tokens are stateless, so logout is handled client-side by
    removing the token. This endpoint is provided for API completeness.
    """
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_profile(
    name: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile."""
    if name:
        current_user.name = name

    db.commit()
    db.refresh(current_user)

    return current_user


@router.put("/preferences", response_model=UserResponse)
async def update_preferences(
    preferences: UserPreferences,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user preferences."""
    if preferences.preferred_provider:
        if preferences.preferred_provider not in ["claude", "openai", "gemini"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid provider. Must be one of: claude, openai, gemini",
            )
        current_user.preferred_provider = preferences.preferred_provider

    if preferences.preferred_source:
        # Validate that the source exists
        from pathlib import Path
        source_dir = Path("sources") / preferences.preferred_source
        if not source_dir.exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Source '{preferences.preferred_source}' not found",
            )
        current_user.preferred_source = preferences.preferred_source

    if preferences.business_type:
        if preferences.business_type not in ["saas", "ecommerce", "general"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid business type. Must be one of: saas, ecommerce, general",
            )
        current_user.business_type = preferences.business_type

    db.commit()
    db.refresh(current_user)

    return current_user
