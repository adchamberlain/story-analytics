"""
Conversation-related Pydantic schemas.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MessageRequest(BaseModel):
    """Schema for sending a message."""

    message: str
    session_id: int | None = None  # Optional: send to specific session


class ClarifyingOption(BaseModel):
    """Schema for a clarifying question option."""

    label: str
    value: str


class ActionButton(BaseModel):
    """Schema for an action button for phase transitions."""

    id: str
    label: str
    style: str = "secondary"  # "primary" or "secondary"


class MessageResponse(BaseModel):
    """Schema for message response."""

    response: str
    phase: str
    session_id: int
    title: str | None = None
    dashboard_url: str | None = None
    dashboard_created: bool = False
    clarifying_options: list[ClarifyingOption] | None = None
    action_buttons: list[ActionButton] | None = None


class ConversationMessage(BaseModel):
    """Schema for a single conversation message."""

    role: str
    content: str


class ConversationSummary(BaseModel):
    """Schema for conversation list item (without full messages)."""

    id: int
    title: str | None = None
    phase: str
    message_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    """Schema for list of conversations."""

    conversations: list[ConversationSummary]


class ConversationSessionResponse(BaseModel):
    """Schema for conversation session response."""

    id: int
    title: str | None = None
    messages: list[ConversationMessage]
    phase: str
    intent: str | None = None
    target_dashboard: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
