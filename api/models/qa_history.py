"""
QA History model for tracking dashboard validation results over time.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class QAHistory(Base):
    """Stores QA validation results for dashboards."""

    __tablename__ = "qa_history"

    id = Column(Integer, primary_key=True, index=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id"), nullable=False)

    # QA result
    passed = Column(Boolean, nullable=False)
    summary = Column(Text, nullable=True)

    # Issues found (stored as JSON-serializable text)
    critical_issues = Column(Text, nullable=True)  # JSON array of strings
    suggestions = Column(Text, nullable=True)  # JSON array of strings

    # Auto-fix tracking
    auto_fix_attempted = Column(Boolean, default=False)
    auto_fix_succeeded = Column(Boolean, default=False)
    issues_fixed = Column(Text, nullable=True)  # JSON array of fixed issues

    # Run metadata
    run_type = Column(String, default="manual")  # "manual", "scheduled", "on_create"
    screenshot_path = Column(String, nullable=True)  # Path to saved screenshot

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    dashboard = relationship("Dashboard", back_populates="qa_history")

    def set_critical_issues(self, issues: list[str]) -> None:
        """Set critical issues from a list."""
        import json
        self.critical_issues = json.dumps(issues) if issues else None

    def get_critical_issues(self) -> list[str]:
        """Get critical issues as a list."""
        import json
        if not self.critical_issues:
            return []
        return json.loads(self.critical_issues)

    def set_suggestions(self, suggestions: list[str]) -> None:
        """Set suggestions from a list."""
        import json
        self.suggestions = json.dumps(suggestions) if suggestions else None

    def get_suggestions(self) -> list[str]:
        """Get suggestions as a list."""
        import json
        if not self.suggestions:
            return []
        return json.loads(self.suggestions)

    def set_issues_fixed(self, issues: list[str]) -> None:
        """Set fixed issues from a list."""
        import json
        self.issues_fixed = json.dumps(issues) if issues else None

    def get_issues_fixed(self) -> list[str]:
        """Get fixed issues as a list."""
        import json
        if not self.issues_fixed:
            return []
        return json.loads(self.issues_fixed)
