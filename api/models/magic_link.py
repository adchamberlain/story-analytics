"""
Magic link model for passwordless authentication.
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, Integer, String, Boolean

from ..database import Base


def generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


class MagicLink(Base):
    """Stores magic link tokens for passwordless auth."""

    __tablename__ = "magic_links"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)

    @classmethod
    def create(cls, email: str, expires_minutes: int = 15) -> "MagicLink":
        """Create a new magic link token."""
        return cls(
            email=email.lower(),
            token=generate_token(),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_minutes),
        )

    @property
    def is_valid(self) -> bool:
        """Check if token is still valid."""
        return not self.used and datetime.now(timezone.utc) < self.expires_at
