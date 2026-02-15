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
from passlib.context import CryptContext

from .services.metadata_db import (
    create_user, get_user_by_email, get_user_by_id,
    ensure_default_user, DEFAULT_USER_ID,
)


# ── Configuration ────────────────────────────────────────────────────────────

AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "false").lower() == "true"
JWT_SECRET = os.environ.get("JWT_SECRET", "story-analytics-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """
    Get the current user. When AUTH_ENABLED=false, returns default user.
    When AUTH_ENABLED=true, validates JWT and returns user dict.
    """
    if not AUTH_ENABLED:
        user_id = ensure_default_user()
        return {"id": user_id, "email": "default@local", "role": "admin"}

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
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """Get current user if authenticated, None otherwise. For public endpoints."""
    if not AUTH_ENABLED:
        user_id = ensure_default_user()
        return {"id": user_id, "email": "default@local", "role": "admin"}

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

    existing = get_user_by_email(request.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    password_hash = pwd_context.hash(request.password)
    user = create_user(request.email, password_hash, request.display_name)
    token = _create_token(user["id"])

    return AuthResponse(token=token, user=user)


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Login with email and password."""
    if not AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Auth is disabled. Set AUTH_ENABLED=true to enable.")

    user = get_user_by_email(request.email)
    if not user or not pwd_context.verify(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_token(user["id"])
    # Don't send password hash to client
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}

    return AuthResponse(token=token, user=safe_user)
