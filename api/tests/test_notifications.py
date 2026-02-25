"""
Tests for notification system.
"""
from api.services.metadata_db import (
    create_notification, list_notifications, get_unread_count,
    mark_notification_read, mark_all_notifications_read,
    ensure_default_user,
)


class TestNotifications:
    def setup_method(self):
        """Ensure default user exists for FK constraints."""
        self.user_id = ensure_default_user()

    def test_create_notification(self):
        notif = create_notification(self.user_id, "comment", {"message": "New comment on your chart"})
        assert notif["type"] == "comment"
        assert notif["payload"]["message"] == "New comment on your chart"
        assert notif["read_at"] is None

    def test_list_notifications(self):
        create_notification(self.user_id, "test_list", {"message": "List test"})
        notifs = list_notifications(self.user_id)
        assert len(notifs) >= 1
        types = [n["type"] for n in notifs]
        assert "test_list" in types

    def test_unread_count(self):
        # Create a fresh notification
        create_notification(self.user_id, "unread_test", {"message": "Unread"})
        count = get_unread_count(self.user_id)
        assert count >= 1

    def test_mark_single_read(self):
        notif = create_notification(self.user_id, "mark_read_test", {"message": "Read me"})
        result = mark_notification_read(notif["id"], self.user_id)
        assert result is True
        # Reading again should return False (already read)
        result2 = mark_notification_read(notif["id"], self.user_id)
        assert result2 is False

    def test_mark_all_read(self):
        create_notification(self.user_id, "mark_all_1", {"message": "A"})
        create_notification(self.user_id, "mark_all_2", {"message": "B"})
        count = mark_all_notifications_read(self.user_id)
        assert count >= 2

    def test_unread_count_after_mark_all(self):
        create_notification(self.user_id, "count_after", {"message": "C"})
        mark_all_notifications_read(self.user_id)
        count = get_unread_count(self.user_id)
        assert count == 0
