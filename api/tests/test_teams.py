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


class TestTeamInviteEndpoint:
    def test_invite_registered_user_adds_directly(self):
        """Inviting a registered user adds them to the team immediately."""
        from api.services.metadata_db import create_user
        email = f"registered_{uuid.uuid4().hex[:8]}@test.com"
        user = create_user(email, "hash123", "Reg User")
        r = client.post("/api/teams/", json={"name": "Invite Reg Team"})
        team_id = r.json()["id"]
        resp = client.post(f"/api/teams/{team_id}/invite", json={"email": email})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "added"
        detail = client.get(f"/api/teams/{team_id}").json()
        member_ids = [m["user_id"] for m in detail["members"]]
        assert user["id"] in member_ids
        client.delete(f"/api/teams/{team_id}")

    def test_invite_unregistered_user_returns_404(self):
        """Inviting an unregistered email returns 404 with guidance message."""
        r = client.post("/api/teams/", json={"name": "Invite Unreg Team"})
        team_id = r.json()["id"]
        email = f"notyet_{uuid.uuid4().hex[:8]}@test.com"
        resp = client.post(f"/api/teams/{team_id}/invite", json={"email": email})
        assert resp.status_code == 404
        assert "not registered" in resp.json()["detail"].lower()
        client.delete(f"/api/teams/{team_id}")

    def test_invite_already_member_returns_409(self):
        """Inviting someone who's already a member returns 409."""
        from api.services.metadata_db import create_user
        email = f"already_{uuid.uuid4().hex[:8]}@test.com"
        user = create_user(email, "hash123", "Already Member")
        r = client.post("/api/teams/", json={"name": "Already Team"})
        team_id = r.json()["id"]
        client.post(f"/api/teams/{team_id}/members", json={"user_id": user["id"]})
        resp = client.post(f"/api/teams/{team_id}/invite", json={"email": email})
        assert resp.status_code == 409
        client.delete(f"/api/teams/{team_id}")


class TestRegistrationAutoJoinsTeam:
    def test_register_with_team_invite_joins_team(self):
        """Registering via a team invite auto-adds user to the team."""
        import os
        if os.environ.get("AUTH_ENABLED", "").lower() != "true":
            return  # This test requires auth enabled
        from api.services.metadata_db import create_invite, get_team_members, create_team, delete_team
        team = create_team("Auto Join Team", "default-user")
        team_id = team["id"]
        email = f"newreg_{uuid.uuid4().hex[:8]}@test.com"
        invite = create_invite(email, "editor", "default-user", team_id=team_id, team_role="member")
        resp = client.post("/api/auth/register", json={
            "email": email,
            "password": "testpass123",
            "invite_token": invite["token"],
        })
        assert resp.status_code == 200
        user_data = resp.json()["user"]
        members = get_team_members(team_id)
        member_ids = [m["user_id"] for m in members]
        assert user_data["id"] in member_ids
        delete_team(team_id, "default-user")
