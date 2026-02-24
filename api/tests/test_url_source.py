"""Tests for external URL data source import endpoint."""

import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


class TestUrlSourceValidation:
    def test_empty_url_rejected(self):
        resp = client.post("/api/data/import/url", json={"url": ""})
        assert resp.status_code == 400

    def test_invalid_scheme_rejected(self):
        resp = client.post("/api/data/import/url", json={"url": "ftp://example.com/data.csv"})
        assert resp.status_code == 400

    def test_non_url_rejected(self):
        resp = client.post("/api/data/import/url", json={"url": "not-a-url"})
        assert resp.status_code == 400


class TestGoogleSheetsValidation:
    def test_invalid_url_rejected(self):
        resp = client.post("/api/data/import/google-sheets", json={"url": "https://example.com"})
        assert resp.status_code == 400

    def test_empty_url_rejected(self):
        resp = client.post("/api/data/import/google-sheets", json={"url": ""})
        assert resp.status_code == 400
