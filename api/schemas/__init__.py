"""
Pydantic schemas for request/response validation.
"""

from .user import UserCreate, UserResponse, UserLogin, Token, UserPreferences
from .dashboard import DashboardResponse, DashboardListResponse

__all__ = [
    "UserCreate",
    "UserResponse",
    "UserLogin",
    "Token",
    "UserPreferences",
    "DashboardResponse",
    "DashboardListResponse",
]
