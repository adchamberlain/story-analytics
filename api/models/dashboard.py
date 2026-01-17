"""
Dashboard model.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Dashboard(Base):
    """Stores dashboard metadata."""

    __tablename__ = "dashboards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    slug = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    original_request = Column(String, nullable=True)  # Original user request for QA validation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="dashboards")
    conversation = relationship("ConversationSession", back_populates="dashboard", uselist=False)
    qa_history = relationship("QAHistory", back_populates="dashboard", order_by="desc(QAHistory.created_at)")

    # Unique constraint: slug per user
    __table_args__ = (
        # Each user can only have one dashboard with a given slug
        # (enforced at application level for SQLite compatibility)
    )
