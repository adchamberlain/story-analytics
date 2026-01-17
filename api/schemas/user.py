"""
User-related Pydantic schemas.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    """Schema for user registration."""

    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    name: str
    preferred_provider: str
    business_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserPreferences(BaseModel):
    """Schema for updating user preferences."""

    preferred_provider: str | None = None
    business_type: str | None = None


class Token(BaseModel):
    """Schema for JWT token response."""

    access_token: str
    token_type: str = "bearer"
