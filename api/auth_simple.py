"""
Simple optional auth system for Story Analytics.

When AUTH_ENABLED=false (default): all requests use a default user.
When AUTH_ENABLED=true: email+password registration/login with JWT.

This replaces the magic link system for the open-source release.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import JWTError, jwt
import bcrypt as _bcrypt

from .services.api_key_service import verify_api_key
from .services.metadata_db import (
    create_user, get_user_by_email, get_user_by_id,
    ensure_default_user, update_user_password,
    update_user_display_name,
    get_api_key_by_prefix, update_api_key_last_used,
)


# ── Configuration ────────────────────────────────────────────────────────────

AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "false").lower() == "true"
JWT_SECRET = os.environ.get("JWT_SECRET", "story-analytics-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())
security = HTTPBearer(auto_error=False)


# ── Token Utilities ──────────────────────────────────────────────────────────

def _create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── Dependency: Get Current User ─────────────────────────────────────────────

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Get the current user from JWT token or API key.

    When AUTH_ENABLED=false, returns default user.
    When AUTH_ENABLED=true, checks API key first (X-API-Key header or api_key query param),
    then falls back to JWT Bearer token.
    """
    if not AUTH_ENABLED:
        user_id = ensure_default_user()
        return {"id": user_id, "email": "default@local", "role": "admin"}

    # Check for API key (header or query param)
    api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if api_key:
        if api_key.startswith("sa_live_") and len(api_key) > 16:
            prefix = f"sa_live_{api_key[8:16]}"
            key_record = get_api_key_by_prefix(prefix)
            if key_record and verify_api_key(api_key, key_record["key_hash"]):
                # Check expiry
                if key_record.get("expires_at"):
                    if datetime.fromisoformat(key_record["expires_at"]) < datetime.now(timezone.utc):
                        raise HTTPException(status_code=401, detail="API key expired")
                update_api_key_last_used(key_record["id"])
                user = get_user_by_id(key_record["user_id"])
                if user:
                    return user
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Fall through to JWT auth
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = _decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


async def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """Get current user if authenticated, None otherwise. For public endpoints."""
    if not AUTH_ENABLED:
        user_id = ensure_default_user()
        return {"id": user_id, "email": "default@local", "role": "admin"}

    # Check for API key
    api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if api_key and api_key.startswith("sa_live_") and len(api_key) > 16:
        prefix = f"sa_live_{api_key[8:16]}"
        key_record = get_api_key_by_prefix(prefix)
        if key_record and verify_api_key(api_key, key_record["key_hash"]):
            update_api_key_last_used(key_record["id"])
            return get_user_by_id(key_record["user_id"])
        return None

    if not credentials:
        return None

    user_id = _decode_token(credentials.credentials)
    if not user_id:
        return None

    return get_user_by_id(user_id)


# ── Auth Router ──────────────────────────────────────────────────────────────

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    invite_token: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class AuthStatusResponse(BaseModel):
    auth_enabled: bool
    user: dict | None = None


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status(user: dict | None = Depends(get_optional_user)):
    """Check auth status. Returns whether auth is enabled and current user if any."""
    return AuthStatusResponse(
        auth_enabled=AUTH_ENABLED,
        user=user,
    )


@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user. Only available when AUTH_ENABLED=true."""
    if not AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Auth is disabled. Set AUTH_ENABLED=true to enable.")

    from .services.metadata_db import get_invite_by_token, mark_invite_used, get_admin_setting, update_user_role, add_team_member, seed_onboarding_tips

    invite = None
    role_override = None

    if request.invite_token:
        invite = get_invite_by_token(request.invite_token)
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid or expired invite link")
        if invite["email"].lower() != request.email.lower():
            raise HTTPException(status_code=400, detail="Email does not match invite")
        role_override = invite["role"]
    else:
        open_reg = get_admin_setting("open_registration")
        if open_reg != "true":
            raise HTTPException(status_code=403, detail="Registration is by invitation only")

    existing = get_user_by_email(request.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    password_hash = _hash_password(request.password)
    user = create_user(request.email, password_hash, request.display_name)

    if role_override:
        update_user_role(user["id"], role_override)
        user["role"] = role_override

    if invite:
        mark_invite_used(invite["id"])
        # Auto-join team if this was a team invite
        if invite.get("team_id"):
            add_team_member(invite["team_id"], user["id"], invite.get("team_role", "member"))

    seed_onboarding_tips(user["id"])

    token = _create_token(user["id"])
    return AuthResponse(token=token, user=user)


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Login with email and password."""
    if not AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Auth is disabled. Set AUTH_ENABLED=true to enable.")

    user = get_user_by_email(request.email)
    if not user:
        # Check if the user exists but is deactivated
        from .services.metadata_db import _ensure_tables
        from .services.db import get_db
        _ensure_tables()
        db = get_db()
        inactive = db.fetchone(
            "SELECT id FROM users WHERE email = ? AND is_active = 0",
            (request.email,),
        )
        if inactive:
            raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact an administrator.")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not _verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_token(user["id"])
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return AuthResponse(token=token, user=safe_user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    """Change the current user's password. Requires current password for verification."""
    if not AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Auth is disabled")

    # Fetch full user record (with password_hash)
    full_user = get_user_by_email(user["email"])
    if not full_user or not _verify_password(request.current_password, full_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    new_hash = _hash_password(request.new_password)
    update_user_password(user["id"], new_hash)

    return {"message": "Password changed successfully"}


class ProfileUpdate(BaseModel):
    display_name: str


@router.put("/profile")
async def update_profile(
    request: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the current user's profile."""
    if not request.display_name.strip():
        raise HTTPException(status_code=400, detail="Display name cannot be empty")
    success = update_user_display_name(user["id"], request.display_name.strip())
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    updated = get_user_by_id(user["id"])
    return updated
