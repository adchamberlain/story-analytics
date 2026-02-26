"""Tests for admin user management."""
import uuid
from fastapi.testclient import TestClient
from api.main import app
from api.services.metadata_db import (
    create_user, list_all_users, update_user_role,
    update_user_status, update_user_display_name, get_user_by_id,
)

client = TestClient(app)


class TestUserManagementDB:
    def _make_user(self, prefix="admin_test"):
        email = f"{prefix}_{uuid.uuid4().hex[:8]}@test.com"
        return create_user(email, "hash123", f"Test {prefix}")

    def test_list_all_users_returns_users(self):
        user = self._make_user("list")
        users = list_all_users()
        ids = [u["id"] for u in users]
        assert user["id"] in ids
        for u in users:
            assert "password_hash" not in u

    def test_list_all_users_excludes_default_user(self):
        users = list_all_users()
        ids = [u["id"] for u in users]
        assert "default-user" not in ids

    def test_update_user_role(self):
        user = self._make_user("role")
        assert user["role"] == "editor"
        result = update_user_role(user["id"], "admin")
        assert result is True
        updated = get_user_by_id(user["id"])
        assert updated["role"] == "admin"

    def test_update_user_role_invalid(self):
        user = self._make_user("badrole")
        result = update_user_role(user["id"], "superadmin")
        assert result is False

    def test_update_user_status_deactivate(self):
        user = self._make_user("deactivate")
        result = update_user_status(user["id"], active=False)
        assert result is True
        assert get_user_by_id(user["id"]) is None

    def test_update_user_status_reactivate(self):
        user = self._make_user("reactivate")
        update_user_status(user["id"], active=False)
        assert get_user_by_id(user["id"]) is None
        update_user_status(user["id"], active=True)
        assert get_user_by_id(user["id"]) is not None

    def test_update_display_name(self):
        user = self._make_user("namechange")
        result = update_user_display_name(user["id"], "New Name")
        assert result is True
        updated = get_user_by_id(user["id"])
        assert updated["display_name"] == "New Name"
