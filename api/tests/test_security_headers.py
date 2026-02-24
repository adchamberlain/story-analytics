"""Tests for SecurityHeadersMiddleware."""

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


class TestUniversalHeaders:
    """All routes should have base security headers."""

    def test_health_has_nosniff(self):
        resp = client.get("/health")
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_health_has_referrer_policy(self):
        resp = client.get("/health")
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    def test_root_has_nosniff(self):
        resp = client.get("/")
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_root_has_referrer_policy(self):
        resp = client.get("/")
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    def test_api_route_has_nosniff(self):
        resp = client.get("/api/providers")
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_api_route_has_referrer_policy(self):
        resp = client.get("/api/providers")
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"


class TestEmbedHeaders:
    """Embed routes should have additional security headers."""

    def test_embed_has_csp(self):
        resp = client.get("/embed/chart/test-id")
        assert "content-security-policy" in resp.headers
        csp = resp.headers["content-security-policy"]
        assert "default-src 'self'" in csp
        assert "frame-ancestors *" in csp

    def test_embed_has_permissions_policy(self):
        resp = client.get("/embed/chart/test-id")
        assert resp.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"

    def test_embed_has_x_frame_options(self):
        resp = client.get("/embed/chart/test-id")
        assert resp.headers["x-frame-options"] == "ALLOWALL"

    def test_embed_also_has_base_headers(self):
        resp = client.get("/embed/chart/test-id")
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"


class TestPublicHeaders:
    """Public routes should also get the embed-style headers."""

    def test_public_has_csp(self):
        resp = client.get("/public/anything")
        assert "content-security-policy" in resp.headers

    def test_public_has_permissions_policy(self):
        resp = client.get("/public/anything")
        assert resp.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"

    def test_public_has_x_frame_options(self):
        resp = client.get("/public/anything")
        assert resp.headers["x-frame-options"] == "ALLOWALL"


class TestNonEmbedExclusions:
    """Non-embed/public routes should NOT have embed-specific headers."""

    def test_health_no_csp(self):
        resp = client.get("/health")
        assert "content-security-policy" not in resp.headers

    def test_health_no_permissions_policy(self):
        resp = client.get("/health")
        assert "permissions-policy" not in resp.headers

    def test_health_no_x_frame_options(self):
        resp = client.get("/health")
        assert "x-frame-options" not in resp.headers

    def test_root_no_csp(self):
        resp = client.get("/")
        assert "content-security-policy" not in resp.headers

    def test_api_route_no_csp(self):
        resp = client.get("/api/providers")
        assert "content-security-policy" not in resp.headers
