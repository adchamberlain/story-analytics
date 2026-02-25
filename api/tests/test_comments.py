"""
Tests for comments system (CRUD + threading).
"""
import uuid
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


class TestCommentsCRUD:
    def test_create_comment_on_chart(self):
        resp = client.post("/api/comments/", json={
            "chart_id": "test-chart-1",
            "body": "Great chart!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["chart_id"] == "test-chart-1"
        assert data["body"] == "Great chart!"
        assert data["dashboard_id"] is None
        assert data["parent_id"] is None
        assert "id" in data

    def test_create_comment_on_dashboard(self):
        resp = client.post("/api/comments/", json={
            "dashboard_id": "test-dash-1",
            "body": "Nice dashboard!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["dashboard_id"] == "test-dash-1"
        assert data["chart_id"] is None

    def test_create_threaded_reply(self):
        # Create parent comment
        parent = client.post("/api/comments/", json={
            "chart_id": "test-chart-2",
            "body": "Parent comment",
        }).json()

        # Create reply
        reply = client.post("/api/comments/", json={
            "chart_id": "test-chart-2",
            "parent_id": parent["id"],
            "body": "This is a reply",
        })
        assert reply.status_code == 200
        assert reply.json()["parent_id"] == parent["id"]

    def test_list_comments_for_chart(self):
        chart_id = "test-chart-list"
        client.post("/api/comments/", json={"chart_id": chart_id, "body": "Comment A"})
        client.post("/api/comments/", json={"chart_id": chart_id, "body": "Comment B"})

        resp = client.get(f"/api/comments/?chart_id={chart_id}")
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) >= 2
        bodies = [c["body"] for c in comments]
        assert "Comment A" in bodies
        assert "Comment B" in bodies

    def test_list_comments_excludes_deleted(self):
        chart_id = "test-chart-del"
        c = client.post("/api/comments/", json={"chart_id": chart_id, "body": "To delete"}).json()

        # Delete the comment
        client.delete(f"/api/comments/{c['id']}")

        # List should not include the deleted comment
        resp = client.get(f"/api/comments/?chart_id={chart_id}")
        ids = [x["id"] for x in resp.json()]
        assert c["id"] not in ids

    def test_update_comment_by_author(self):
        c = client.post("/api/comments/", json={"chart_id": "test-chart-upd", "body": "Original"}).json()
        resp = client.put(f"/api/comments/{c['id']}", json={"body": "Updated text"})
        assert resp.status_code == 200
        assert resp.json()["body"] == "Updated text"
        assert resp.json()["updated_at"] is not None

    def test_update_comment_by_nonauthor_fails(self):
        # Since AUTH_ENABLED=false, all requests use the same default user.
        # We test via metadata_db directly for non-author check.
        from api.services.metadata_db import create_comment, update_comment, create_user
        email = f"commenter_{uuid.uuid4().hex[:8]}@test.com"
        user_a = create_user(email, "hash", "User A")
        c = create_comment(chart_id="test-x", dashboard_id=None, parent_id=None, author_id=user_a["id"], body="Mine")
        result = update_comment(c["id"], "nonexistent-user", "Hacked!")
        assert result is None

    def test_delete_comment(self):
        c = client.post("/api/comments/", json={"chart_id": "test-chart-del2", "body": "Bye"}).json()
        resp = client.delete(f"/api/comments/{c['id']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    def test_require_chart_or_dashboard(self):
        resp = client.post("/api/comments/", json={"body": "No target"})
        assert resp.status_code == 400

    def test_list_comments_returns_author_name(self):
        chart_id = "test-chart-author"
        client.post("/api/comments/", json={"chart_id": chart_id, "body": "Has author"})
        resp = client.get(f"/api/comments/?chart_id={chart_id}")
        assert resp.status_code == 200
        comments = resp.json()
        # Default user has display_name "Default User"
        assert any(c.get("author_name") == "Default User" for c in comments)
