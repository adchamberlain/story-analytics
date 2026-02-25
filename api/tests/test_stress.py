"""
Stress tests for all API endpoints.
Run after any feature change to catch regressions.

Usage: python -m pytest api/tests/test_stress.py -x --tb=short -v
"""
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


# --- Helpers ---

def _create_chart(**overrides) -> dict:
    """Create a chart and return the full response dict."""
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Stress Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200, f"Failed to create chart: {resp.text}"
    return resp.json()


def _cleanup_chart(chart_id: str):
    """Delete a chart, ignore errors."""
    client.delete(f"/api/v2/charts/{chart_id}")


def _create_dashboard(**overrides) -> str:
    """Create a dashboard and return its ID."""
    payload = {"title": "Stress Test Dashboard"}
    payload.update(overrides)
    resp = client.post("/api/v2/dashboards/", json=payload)
    assert resp.status_code == 200, f"Failed to create dashboard: {resp.text}"
    return resp.json()["id"]


def _cleanup_dashboard(dashboard_id: str):
    """Delete a dashboard, ignore errors."""
    client.delete(f"/api/v2/dashboards/{dashboard_id}")


# --- Chart Storage Stress ---
# Note: GET /api/v2/charts/{id} re-executes SQL against DuckDB, which requires
# a real source. These tests focus on save/list/update/delete which don't need
# SQL execution. The save response contains all chart fields for validation.

class TestChartStorageEdgeCases:
    def test_save_chart_minimal_fields(self):
        """Save with only required fields."""
        chart = _create_chart()
        try:
            assert chart["chart_type"] == "BarChart"
            assert chart["title"] == "Stress Test Chart"
            assert chart["sql"] == "SELECT 1 as x, 2 as y"
            assert len(chart["id"]) == 12
        finally:
            _cleanup_chart(chart["id"])

    def test_save_chart_all_fields(self):
        """Save with every possible field populated."""
        chart = _create_chart(
            chart_type="LineChart",
            title="Full chart with all fields",
            sql="SELECT 1 as date, 2 as value",
            x="date",
            y=["value"],
            series=None,
            horizontal=False,
            sort=True,
            subtitle="A subtitle",
            source="Test data",
            reasoning="Testing all fields",
            config={
                "showGrid": True,
                "showLegend": True,
                "palette": "default",
            },
        )
        try:
            assert chart["subtitle"] == "A subtitle"
            assert chart["source"] == "Test data"
            assert chart["config"]["showGrid"] is True
            assert chart["chart_type"] == "LineChart"
        finally:
            _cleanup_chart(chart["id"])

    def test_save_chart_unicode_title(self):
        """Unicode in title, subtitle, source."""
        chart = _create_chart(
            title="日本語テスト Ñoño",
            subtitle="Ünïcödë súbtítlé",
        )
        try:
            assert "日本語" in chart["title"]
            assert "Ünïcödë" in chart["subtitle"]
        finally:
            _cleanup_chart(chart["id"])

    def test_save_chart_empty_title(self):
        """Empty string title should still save."""
        chart = _create_chart(title="")
        try:
            assert chart["title"] == ""
        finally:
            _cleanup_chart(chart["id"])

    def test_save_chart_very_long_sql(self):
        """SQL with 10K+ characters."""
        long_sql = "SELECT " + ", ".join(f"col_{i}" for i in range(500)) + " FROM big_table"
        chart = _create_chart(sql=long_sql)
        try:
            assert len(chart["sql"]) > 3000
        finally:
            _cleanup_chart(chart["id"])

    def test_get_nonexistent_chart(self):
        """404 for missing chart."""
        resp = client.get("/api/v2/charts/deadbeef1234")
        assert resp.status_code == 404

    def test_update_nonexistent_chart(self):
        """404 for updating missing chart."""
        resp = client.put("/api/v2/charts/deadbeef1234", json={"title": "X"})
        assert resp.status_code == 404

    def test_delete_nonexistent_chart(self):
        """404 for deleting missing chart."""
        resp = client.delete("/api/v2/charts/deadbeef1234")
        assert resp.status_code == 404

    def test_update_chart_preserves_id(self):
        """Update should not change the chart ID."""
        chart = _create_chart()
        try:
            resp = client.put(f"/api/v2/charts/{chart['id']}", json={"title": "Updated"})
            assert resp.status_code == 200
            assert resp.json()["id"] == chart["id"]
            assert resp.json()["title"] == "Updated"
        finally:
            _cleanup_chart(chart["id"])

    def test_save_chart_write_sql_blocked(self):
        """Non-SELECT SQL should be rejected."""
        for sql in [
            "INSERT INTO x VALUES (1)",
            "DROP TABLE x",
            "DELETE FROM x",
            "UPDATE x SET y=1",
        ]:
            resp = client.post("/api/v2/charts/save", json={
                "source_id": "test123456ab",
                "chart_type": "BarChart",
                "title": "Bad SQL",
                "sql": sql,
            })
            assert resp.status_code == 400, f"Write query not blocked: {sql}"

    def test_list_charts(self):
        """List endpoint returns array."""
        resp = client.get("/api/v2/charts/")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_save_and_delete_chart(self):
        """Save then delete — verify it's gone."""
        chart = _create_chart()
        chart_id = chart["id"]
        resp = client.delete(f"/api/v2/charts/{chart_id}")
        assert resp.status_code == 200
        # Verify it's gone
        resp = client.get(f"/api/v2/charts/{chart_id}")
        assert resp.status_code == 404

    def test_chart_appears_in_list(self):
        """Saved chart should appear in list endpoint."""
        chart = _create_chart(title="List Test Chart")
        try:
            resp = client.get("/api/v2/charts/")
            assert resp.status_code == 200
            ids = [c["id"] for c in resp.json()]
            assert chart["id"] in ids
        finally:
            _cleanup_chart(chart["id"])


# --- Dashboard Storage Stress ---

class TestDashboardStorageEdgeCases:
    def test_create_empty_dashboard(self):
        """Dashboard with no charts."""
        dash_id = _create_dashboard()
        try:
            resp = client.get(f"/api/v2/dashboards/{dash_id}")
            assert resp.status_code == 200
            assert resp.json()["title"] == "Stress Test Dashboard"
        finally:
            _cleanup_dashboard(dash_id)

    def test_create_dashboard_unicode(self):
        """Unicode in dashboard title."""
        dash_id = _create_dashboard(
            title="Données françaises",
            description="Résumé des données",
        )
        try:
            resp = client.get(f"/api/v2/dashboards/{dash_id}")
            assert resp.status_code == 200
            assert "françaises" in resp.json()["title"]
        finally:
            _cleanup_dashboard(dash_id)

    def test_dashboard_with_invalid_chart_ref(self):
        """Dashboard referencing nonexistent chart ID."""
        dash_id = _create_dashboard(
            charts=[{"chart_id": "nonexistent123", "width": "full"}],
        )
        try:
            resp = client.get(f"/api/v2/dashboards/{dash_id}")
            assert resp.status_code == 200
            charts = resp.json()["charts"]
            assert len(charts) == 1
            assert charts[0]["error"] is not None
        finally:
            _cleanup_dashboard(dash_id)

    def test_update_dashboard(self):
        """Update dashboard title."""
        dash_id = _create_dashboard()
        try:
            resp = client.put(f"/api/v2/dashboards/{dash_id}", json={"title": "Updated"})
            assert resp.status_code == 200
            assert resp.json()["title"] == "Updated"
        finally:
            _cleanup_dashboard(dash_id)

    def test_delete_nonexistent_dashboard(self):
        """404 for deleting missing dashboard."""
        resp = client.delete("/api/v2/dashboards/deadbeef1234")
        assert resp.status_code == 404

    def test_list_dashboards(self):
        """List endpoint returns array."""
        resp = client.get("/api/v2/dashboards/")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_save_and_delete_dashboard(self):
        """Save then delete — verify it's gone."""
        dash_id = _create_dashboard()
        resp = client.delete(f"/api/v2/dashboards/{dash_id}")
        assert resp.status_code == 200
        resp = client.get(f"/api/v2/dashboards/{dash_id}")
        assert resp.status_code == 404


# --- Chart ID Validation ---

class TestIDValidation:
    def test_invalid_chart_id_path_traversal(self):
        """Path traversal attempts should fail."""
        for bad_id in ["../etc/passwd", "../../secret", "a/b/c"]:
            resp = client.get(f"/api/v2/charts/{bad_id}")
            assert resp.status_code in (404, 422), f"Path traversal not blocked: {bad_id}"

    def test_invalid_dashboard_id_path_traversal(self):
        """Path traversal attempts should fail."""
        for bad_id in ["../etc/passwd", "../../secret"]:
            resp = client.get(f"/api/v2/dashboards/{bad_id}")
            assert resp.status_code in (404, 422), f"Path traversal not blocked: {bad_id}"
