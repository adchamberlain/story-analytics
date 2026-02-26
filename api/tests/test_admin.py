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


class TestAdminEndpoints:
    """Test admin API endpoints.

    Note: In test env, AUTH_ENABLED=false so default user has role=admin.
    All admin endpoints should work with the default user.
    """

    def _make_user(self, prefix="endpoint"):
        email = f"{prefix}_{uuid.uuid4().hex[:8]}@test.com"
        return create_user(email, "hash123", f"Test {prefix}")

    def test_list_users(self):
        user = self._make_user("listep")
        resp = client.get("/api/admin/users")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        ids = [u["id"] for u in data]
        assert user["id"] in ids

    def test_change_user_role(self):
        user = self._make_user("roleep")
        resp = client.put(f"/api/admin/users/{user['id']}/role", json={"role": "admin"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_change_role_invalid(self):
        user = self._make_user("badroleep")
        resp = client.put(f"/api/admin/users/{user['id']}/role", json={"role": "superadmin"})
        assert resp.status_code == 400

    def test_deactivate_user(self):
        user = self._make_user("deactep")
        resp = client.put(f"/api/admin/users/{user['id']}/status", json={"active": False})
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_reactivate_user(self):
        user = self._make_user("reactep")
        client.put(f"/api/admin/users/{user['id']}/status", json={"active": False})
        resp = client.put(f"/api/admin/users/{user['id']}/status", json={"active": True})
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    def test_cannot_deactivate_self(self):
        resp = client.put("/api/admin/users/default-user/status", json={"active": False})
        assert resp.status_code == 400

    def test_create_invite(self):
        resp = client.post("/api/admin/invites", json={
            "email": "newinvite@test.com", "role": "editor"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "newinvite@test.com"
        assert "token" in data
        assert "invite_url" in data

    def test_list_invites(self):
        client.post("/api/admin/invites", json={"email": "listinv@test.com", "role": "editor"})
        resp = client.get("/api/admin/invites")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_invite(self):
        r = client.post("/api/admin/invites", json={"email": "delinv@test.com", "role": "editor"})
        invite_id = r.json()["id"]
        resp = client.delete(f"/api/admin/invites/{invite_id}")
        assert resp.status_code == 200

    def test_get_admin_settings(self):
        resp = client.get("/api/admin/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "open_registration" in data

    def test_update_admin_settings(self):
        resp = client.put("/api/admin/settings", json={"open_registration": "false"})
        assert resp.status_code == 200
        resp2 = client.get("/api/admin/settings")
        assert resp2.json()["open_registration"] == "false"
        client.put("/api/admin/settings", json={"open_registration": "true"})


class TestProfileAndAuth:
    def test_update_profile_display_name(self):
        resp = client.put("/api/auth/profile", json={"display_name": "New Display Name"})
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "New Display Name"

    def test_update_profile_empty_name_rejected(self):
        resp = client.put("/api/auth/profile", json={"display_name": ""})
        assert resp.status_code == 400


class TestRegistrationWithInvites:
    def test_register_with_valid_invite_token(self):
        """Test the invite token flow at the DB level (AUTH_ENABLED=false in test env)."""
        inv = client.post("/api/admin/invites", json={
            "email": "invited@test.com", "role": "editor"
        })
        token = inv.json()["token"]
        from api.services.metadata_db import get_invite_by_token, mark_invite_used
        invite = get_invite_by_token(token)
        assert invite is not None
        assert invite["email"] == "invited@test.com"
        mark_invite_used(invite["id"])
        assert get_invite_by_token(token) is None
