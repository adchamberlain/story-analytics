"""
Tests for teams system (CRUD + membership).
"""
import uuid
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


class TestTeamsCRUD:
    def test_create_team(self):
        resp = client.post("/api/teams/", json={"name": "Data Team"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Data Team"
        assert "id" in data
        # Cleanup
        client.delete(f"/api/teams/{data['id']}")

    def test_list_teams_includes_created(self):
        r = client.post("/api/teams/", json={"name": "List Test Team"})
        team_id = r.json()["id"]
        resp = client.get("/api/teams/")
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json()]
        assert team_id in ids
        client.delete(f"/api/teams/{team_id}")

    def test_get_team_detail_includes_members(self):
        r = client.post("/api/teams/", json={"name": "Detail Team"})
        team_id = r.json()["id"]
        resp = client.get(f"/api/teams/{team_id}")
        assert resp.status_code == 200
        detail = resp.json()
        assert "members" in detail
        assert len(detail["members"]) >= 1  # Owner is auto-added
        client.delete(f"/api/teams/{team_id}")

    def test_add_member(self):
        r = client.post("/api/teams/", json={"name": "Member Team"})
        team_id = r.json()["id"]
        # Add a member (using default user id — already a member, so role updates)
        from api.services.metadata_db import create_user
        email = f"teamtest_{uuid.uuid4().hex[:8]}@test.com"
        user = create_user(email, "hash123", "Test Member")
        resp = client.post(f"/api/teams/{team_id}/members", json={
            "user_id": user["id"], "role": "member"
        })
        assert resp.status_code == 200
        assert resp.json()["role"] == "member"
        client.delete(f"/api/teams/{team_id}")

    def test_remove_member(self):
        r = client.post("/api/teams/", json={"name": "Remove Team"})
        team_id = r.json()["id"]
        from api.services.metadata_db import create_user
        email = f"removeme_{uuid.uuid4().hex[:8]}@test.com"
        user = create_user(email, "hash123", "Remove Me")
        client.post(f"/api/teams/{team_id}/members", json={"user_id": user["id"]})
        resp = client.delete(f"/api/teams/{team_id}/members/{user['id']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "removed"
        client.delete(f"/api/teams/{team_id}")

    def test_delete_team_by_owner(self):
        r = client.post("/api/teams/", json={"name": "Delete Me Team"})
        team_id = r.json()["id"]
        resp = client.delete(f"/api/teams/{team_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"
        # Verify it's gone
        resp2 = client.get(f"/api/teams/{team_id}")
        assert resp2.status_code == 404

    def test_delete_team_by_nonowner_fails(self):
        from api.services.metadata_db import delete_team
        r = client.post("/api/teams/", json={"name": "NonOwner Team"})
        team_id = r.json()["id"]
        result = delete_team(team_id, "fake-user-id")
        assert result is False
        # Cleanup with actual owner
        client.delete(f"/api/teams/{team_id}")

    def test_owner_auto_added_as_admin(self):
        r = client.post("/api/teams/", json={"name": "Admin Check Team"})
        team_id = r.json()["id"]
        detail = client.get(f"/api/teams/{team_id}").json()
        members = detail["members"]
        admin_members = [m for m in members if m["role"] == "admin"]
        assert len(admin_members) >= 1
        client.delete(f"/api/teams/{team_id}")


class TestTeamInviteDB:
    def test_create_invite_with_team_id(self):
        from api.services.metadata_db import create_invite, get_invite_by_token
        invite = create_invite(
            email="teaminvite@test.com",
            role="editor",
            created_by="default-user",
            team_id="team-abc",
            team_role="member",
        )
        assert invite["team_id"] == "team-abc"
        assert invite["team_role"] == "member"
        fetched = get_invite_by_token(invite["token"])
        assert fetched is not None
        assert fetched["team_id"] == "team-abc"
        assert fetched["team_role"] == "member"

    def test_create_invite_without_team_id_defaults_null(self):
        from api.services.metadata_db import create_invite
        invite = create_invite(
            email="admininvite@test.com",
            role="editor",
            created_by="default-user",
        )
        assert invite.get("team_id") is None
        assert invite.get("team_role") is None

    def test_get_pending_team_invites(self):
        from api.services.metadata_db import create_invite, get_pending_team_invites
        team_id = f"team-pending-{uuid.uuid4().hex[:8]}"
        create_invite("pending1@test.com", "editor", "default-user", team_id=team_id)
        create_invite("pending2@test.com", "editor", "default-user", team_id=team_id)
        create_invite("admin@test.com", "editor", "default-user")
        pending = get_pending_team_invites(team_id)
        assert len(pending) == 2
        emails = [p["email"] for p in pending]
        assert "pending1@test.com" in emails
        assert "pending2@test.com" in emails


class TestTeamEmails:
    def test_send_team_invite_email_no_resend(self):
        """Without RESEND_API_KEY, prints to console and returns True."""
        import os
        os.environ.pop("RESEND_API_KEY", None)
        from api.email import send_team_invite_email
        result = send_team_invite_email(
            to_email="newuser@test.com",
            team_name="Data Team",
            invite_url="http://localhost:3001/login?invite=abc123",
            inviter_name="Admin User",
        )
        assert result is True

    def test_send_team_added_email_no_resend(self):
        """Without RESEND_API_KEY, prints to console and returns True."""
        import os
        os.environ.pop("RESEND_API_KEY", None)
        from api.email import send_team_added_email
        result = send_team_added_email(
            to_email="existing@test.com",
            team_name="Data Team",
            app_url="http://localhost:3001",
            inviter_name="Admin User",
        )
        assert result is True
