"""
Tests for API key generation, validation, and management endpoints.
"""
from fastapi.testclient import TestClient
from api.main import app
from api.services.api_key_service import generate_api_key, verify_api_key

client = TestClient(app)


# ── Unit Tests: API Key Service ──────────────────────────────────────────────


class TestApiKeyService:
    def test_generate_key_has_correct_prefix(self):
        """Generated key should start with sa_live_ prefix."""
        full_key, key_hash, key_prefix = generate_api_key()
        assert full_key.startswith("sa_live_")
        assert key_prefix.startswith("sa_live_")
        assert len(full_key) > 16  # sa_live_ + 32 chars of randomness

    def test_verify_key_with_correct_hash(self):
        """Verifying a key against its own hash should return True."""
        full_key, key_hash, key_prefix = generate_api_key()
        assert verify_api_key(full_key, key_hash) is True

    def test_verify_key_with_wrong_hash(self):
        """Verifying a key against a different hash should return False."""
        full_key, key_hash, key_prefix = generate_api_key()
        wrong_hash = "0" * 64
        assert verify_api_key(full_key, wrong_hash) is False

    def test_generated_keys_are_unique(self):
        """Two generated keys should be different."""
        key1, hash1, prefix1 = generate_api_key()
        key2, hash2, prefix2 = generate_api_key()
        assert key1 != key2
        assert hash1 != hash2


# ── API Endpoint Tests ───────────────────────────────────────────────────────


class TestApiKeyEndpoints:
    def test_create_key(self):
        """POST /api/api-keys/ should create a key and return the full key."""
        resp = client.post("/api/api-keys/", json={"name": "Test Key"})
        assert resp.status_code == 200
        data = resp.json()
        assert "key" in data
        assert data["key"].startswith("sa_live_")
        assert data["name"] == "Test Key"
        assert "id" in data
        assert "key_prefix" in data
        # Cleanup
        client.delete(f"/api/api-keys/{data['id']}")

    def test_list_keys_returns_created_key(self):
        """GET /api/api-keys/ should list keys with prefix only (no full key)."""
        # Create a key
        create_resp = client.post("/api/api-keys/", json={"name": "List Test Key"})
        created = create_resp.json()
        try:
            resp = client.get("/api/api-keys/")
            assert resp.status_code == 200
            keys = resp.json()
            found = [k for k in keys if k["id"] == created["id"]]
            assert len(found) == 1
            assert found[0]["name"] == "List Test Key"
            assert found[0]["key_prefix"].startswith("sa_live_")
            # Full key should NOT be in list response
            assert "key" not in found[0]
        finally:
            client.delete(f"/api/api-keys/{created['id']}")

    def test_revoke_key_succeeds(self):
        """DELETE /api/api-keys/{key_id} should revoke the key."""
        create_resp = client.post("/api/api-keys/", json={"name": "Revoke Test"})
        created = create_resp.json()
        resp = client.delete(f"/api/api-keys/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    def test_revoke_nonexistent_key_returns_404(self):
        """DELETE /api/api-keys/{key_id} returns 404 for unknown key."""
        resp = client.delete("/api/api-keys/doesnotexist")
        assert resp.status_code == 404

    def test_create_key_with_scopes(self):
        """Creating a key with custom scopes should be stored correctly."""
        resp = client.post("/api/api-keys/", json={"name": "Scoped Key", "scopes": "read,write"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["scopes"] == "read,write"
        client.delete(f"/api/api-keys/{data['id']}")
