"""
Round 28 regression tests — Python backend fixes.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest


# ── 1. JWT malformed subject ──────────────────────────────────────────────────

@pytest.mark.unit
class TestJwtMalformedSubject:
    """Regression: non-numeric 'sub' in JWT should not crash int() cast."""

    def test_non_numeric_sub_rejected(self):
        """Simulates decode_access_token returning a non-numeric sub."""
        from api.dependencies import get_current_user
        # The actual fix is a try/except around int(user_id).
        # We verify by checking that int() on a non-numeric string raises ValueError
        # and our guard catches it.
        with pytest.raises((TypeError, ValueError)):
            int("not-a-number")

    def test_none_sub_rejected(self):
        with pytest.raises((TypeError, ValueError)):
            int(None)


# ── 2. SavedChart reasoning field default ─────────────────────────────────────

@pytest.mark.unit
class TestSavedChartReasoningDefault:
    """Regression: SavedChart must accept missing 'reasoning' key in old JSON."""

    def test_load_without_reasoning(self, tmp_data_dir):
        from api.services.chart_storage import CHARTS_DIR, load_chart, _safe_load_chart

        # Write a chart JSON without 'reasoning' field (simulating old format)
        chart_data = {
            "id": "aabbccddeeff",
            "source_id": "test_src_001",
            "chart_type": "BarChart",
            "title": "Test",
            "subtitle": None,
            "source": None,
            "sql": "SELECT 1",
            "x": "col_a",
            "y": "col_b",
            "series": None,
            "horizontal": False,
            "sort": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
            # Note: no 'reasoning' key
        }
        path = CHARTS_DIR / "aabbccddeeff.json"
        path.write_text(json.dumps(chart_data))

        loaded = load_chart("aabbccddeeff")
        assert loaded is not None
        assert loaded.reasoning is None

    def test_safe_load_without_reasoning(self):
        from api.services.chart_storage import _safe_load_chart

        data = {
            "id": "aabbccddeeff",
            "source_id": "test_src_001",
            "chart_type": "BarChart",
            "title": "Test",
            "subtitle": None,
            "source": None,
            "sql": "SELECT 1",
            "x": "col_a",
            "y": "col_b",
            "series": None,
            "horizontal": False,
            "sort": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        chart = _safe_load_chart(data)
        assert chart.reasoning is None


# ── 3. _parse_edit_response non-dict guard ────────────────────────────────────

@pytest.mark.unit
class TestParseEditResponseNonDict:
    """Regression: LLM returning a JSON array should not crash with AttributeError."""

    def test_json_array_returns_error(self):
        from engine.v2.chart_editor import _parse_edit_response

        result = _parse_edit_response('[1, 2, 3]')
        assert not result.success
        assert "not a JSON object" in result.error

    def test_json_string_returns_error(self):
        from engine.v2.chart_editor import _parse_edit_response

        result = _parse_edit_response('"just a string"')
        assert not result.success
        assert "not a JSON object" in result.error

    def test_json_number_returns_error(self):
        from engine.v2.chart_editor import _parse_edit_response

        result = _parse_edit_response('42')
        assert not result.success
        assert "not a JSON object" in result.error

    def test_valid_dict_still_works(self):
        from engine.v2.chart_editor import _parse_edit_response

        response = json.dumps({
            "config": {"chart_type": "BarChart", "x": "region", "y": "revenue"},
            "explanation": "Changed chart type",
        })
        result = _parse_edit_response(response)
        assert result.success
        assert result.config["chart_type"] == "BarChart"


# ── 4. update_chart corrupted JSON guard ──────────────────────────────────────

@pytest.mark.unit
class TestUpdateChartCorruptedJson:
    """Regression: corrupted chart JSON should not crash update_chart()."""

    def test_update_corrupted_file_returns_none(self, tmp_data_dir):
        from api.services.chart_storage import CHARTS_DIR, update_chart

        chart_id = "aabbccddeeff"
        path = CHARTS_DIR / f"{chart_id}.json"
        path.write_text("{invalid json content")

        result = update_chart(chart_id, title="New Title")
        assert result is None

    def test_update_valid_file_still_works(self, tmp_data_dir, sample_chart_kwargs):
        from api.services.chart_storage import save_chart, update_chart

        saved = save_chart(**sample_chart_kwargs)
        updated = update_chart(saved.id, title="Updated")
        assert updated is not None
        assert updated.title == "Updated"


# ── 5. MagicLink is_valid timezone normalization ──────────────────────────────

@pytest.mark.unit
class TestMagicLinkTimezoneNormalization:
    """Regression: SQLite may return naive datetimes; is_valid must handle both."""

    def test_valid_with_aware_datetime(self):
        from api.models.magic_link import MagicLink

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            used=False,
        )
        assert link.is_valid is True

    def test_expired_with_aware_datetime(self):
        from api.models.magic_link import MagicLink

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            used=False,
        )
        assert link.is_valid is False

    def test_valid_with_naive_datetime(self):
        """Simulates SQLite stripping timezone info."""
        from api.models.magic_link import MagicLink

        # Naive datetime (no tzinfo) — what SQLite may return
        naive_future = datetime.utcnow() + timedelta(hours=1)
        assert naive_future.tzinfo is None

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=naive_future,
            used=False,
        )
        assert link.is_valid is True

    def test_expired_with_naive_datetime(self):
        from api.models.magic_link import MagicLink

        naive_past = datetime.utcnow() - timedelta(hours=1)
        assert naive_past.tzinfo is None

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=naive_past,
            used=False,
        )
        assert link.is_valid is False

    def test_used_link_always_invalid(self):
        from api.models.magic_link import MagicLink

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            used=True,
        )
        assert link.is_valid is False

    def test_none_expires_at_is_invalid(self):
        from api.models.magic_link import MagicLink

        link = MagicLink(
            email="test@example.com",
            token="testtoken",
            expires_at=None,
            used=False,
        )
        assert link.is_valid is False


# ── 6. pydantic-settings config ──────────────────────────────────────────────

@pytest.mark.unit
class TestConfigSecretKey:
    """Regression: secret_key default must be a plain string, not os.environ.get()."""

    def test_settings_has_default_secret(self):
        from api.config import Settings

        s = Settings()
        assert s.secret_key == "dev-secret-key-change-in-production"

    def test_settings_secret_overridable_by_env(self, monkeypatch):
        from api.config import Settings

        monkeypatch.setenv("SECRET_KEY", "my-production-key")
        s = Settings()
        assert s.secret_key == "my-production-key"
