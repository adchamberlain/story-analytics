"""Tests for admin user management."""
import uuid
from fastapi.testclient import TestClient
from api.main import app
from api.services.metadata_db import (
    create_user, list_all_users, update_user_role,
    update_user_status, update_user_display_name, get_user_by_id,
    create_invite, list_invites, get_invite_by_token, mark_invite_used, delete_invite,
    get_admin_setting, set_admin_setting,
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


class TestInvitesDB:
    def test_create_and_list_invites(self):
        invite = create_invite("invite@test.com", "editor", "creator-id")
        assert invite["email"] == "invite@test.com"
        assert invite["role"] == "editor"
        assert invite["token"]
        invites = list_invites()
        tokens = [i["token"] for i in invites]
        assert invite["token"] in tokens

    def test_get_invite_by_token(self):
        invite = create_invite("token@test.com", "editor", "creator-id")
        found = get_invite_by_token(invite["token"])
        assert found is not None
        assert found["email"] == "token@test.com"

    def test_get_invite_by_token_expired(self):
        invite = create_invite("expired@test.com", "editor", "creator-id")
        from api.services.db import get_db
        db = get_db()
        db.execute(
            "UPDATE invites SET expires_at = '2020-01-01T00:00:00' WHERE id = ?",
            (invite["id"],),
        )
        assert get_invite_by_token(invite["token"]) is None

    def test_mark_invite_used(self):
        invite = create_invite("used@test.com", "editor", "creator-id")
        mark_invite_used(invite["id"])
        assert get_invite_by_token(invite["token"]) is None

    def test_delete_invite(self):
        invite = create_invite("delete@test.com", "editor", "creator-id")
        result = delete_invite(invite["id"])
        assert result is True
        assert get_invite_by_token(invite["token"]) is None


class TestAdminSettingsDB:
    def test_default_open_registration(self):
        val = get_admin_setting("open_registration")
        assert val == "true"

    def test_set_and_get_setting(self):
        set_admin_setting("open_registration", "false")
        assert get_admin_setting("open_registration") == "false"
        set_admin_setting("open_registration", "true")
