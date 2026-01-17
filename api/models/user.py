"""
User model for authentication.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class User(Base):
    """User account model."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)  # Nullable for passwordless auth
    name = Column(String, nullable=False)
    preferred_provider = Column(String, default="claude")
    business_type = Column(String, default="general")  # saas, ecommerce, or general
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sessions = relationship("ConversationSession", back_populates="user")
    dashboards = relationship("Dashboard", back_populates="user")
