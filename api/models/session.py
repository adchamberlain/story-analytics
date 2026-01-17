"""
Conversation session model.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class ConversationSession(Base):
    """Stores conversation state for a user."""

    __tablename__ = "conversation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)  # Auto-generated from first message
    messages = Column(JSON, default=list)
    phase = Column(String, default="intent")
    intent = Column(String, nullable=True)
    target_dashboard = Column(String, nullable=True)
    original_request = Column(String, nullable=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="sessions")
    dashboard = relationship("Dashboard", back_populates="conversation")
