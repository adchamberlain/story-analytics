"""
Tests for the notebooks REST API router.
Covers CRUD, upload, kernel execution, and DataFrame bridge endpoints.
"""

import json

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _create_notebook(title: str = "Test Notebook") -> dict:
    resp = client.post("/api/notebooks/", json={"title": title})
    assert resp.status_code == 200
    return resp.json()


def _cleanup_notebook(notebook_id: str):
    client.delete(f"/api/notebooks/{notebook_id}")


# ── CRUD Tests ───────────────────────────────────────────────────────────────


class TestNotebookCRUD:
    def test_create_notebook(self):
        nb = _create_notebook("My Notebook")
        try:
            assert nb["title"] == "My Notebook"
            assert nb["id"]
            assert nb["cell_count"] >= 1  # default welcome cell
            assert nb["created_at"]
            assert nb["updated_at"]
        finally:
            _cleanup_notebook(nb["id"])

    def test_create_notebook_default_title(self):
        resp = client.post("/api/notebooks/", json={})
        assert resp.status_code == 200
        nb = resp.json()
        try:
            assert nb["title"] == "Untitled"
        finally:
            _cleanup_notebook(nb["id"])

    def test_list_notebooks(self):
        nb1 = _create_notebook("List Test 1")
        nb2 = _create_notebook("List Test 2")
        try:
            resp = client.get("/api/notebooks/")
            assert resp.status_code == 200
            notebooks = resp.json()
            ids = [n["id"] for n in notebooks]
            assert nb1["id"] in ids
            assert nb2["id"] in ids
        finally:
            _cleanup_notebook(nb1["id"])
            _cleanup_notebook(nb2["id"])

    def test_get_notebook(self):
        nb = _create_notebook("Get Test")
        try:
            resp = client.get(f"/api/notebooks/{nb['id']}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["nbformat"] == 4
            assert isinstance(data["cells"], list)
            assert data["metadata"]["title"] == "Get Test"
        finally:
            _cleanup_notebook(nb["id"])

    def test_get_notebook_not_found(self):
        resp = client.get("/api/notebooks/000000000000")
        assert resp.status_code == 404

    def test_update_notebook_title(self):
        nb = _create_notebook("Original Title")
        try:
            resp = client.put(
                f"/api/notebooks/{nb['id']}",
                json={"title": "Updated Title"},
            )
            assert resp.status_code == 200
            assert resp.json()["title"] == "Updated Title"
        finally:
            _cleanup_notebook(nb["id"])

    def test_update_notebook_cells(self):
        nb = _create_notebook("Cell Update Test")
        try:
            new_cells = [
                {"cell_type": "code", "source": "print('hello')", "metadata": {}},
            ]
            resp = client.put(
                f"/api/notebooks/{nb['id']}",
                json={"cells": new_cells},
            )
            assert resp.status_code == 200
            assert resp.json()["cell_count"] == 1
        finally:
            _cleanup_notebook(nb["id"])

    def test_update_notebook_not_found(self):
        resp = client.put(
            "/api/notebooks/000000000000",
            json={"title": "Nope"},
        )
        assert resp.status_code == 404

    def test_delete_notebook(self):
        nb = _create_notebook("Delete Me")
        resp = client.delete(f"/api/notebooks/{nb['id']}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify it's gone
        resp = client.get(f"/api/notebooks/{nb['id']}")
        assert resp.status_code == 404

    def test_delete_notebook_not_found(self):
        resp = client.delete("/api/notebooks/000000000000")
        assert resp.status_code == 404


# ── Upload Tests ─────────────────────────────────────────────────────────────


class TestNotebookUpload:
    def test_upload_ipynb(self):
        ipynb = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {"cell_type": "code", "source": "1+1", "metadata": {}},
            ],
        }
        content = json.dumps(ipynb).encode()
        resp = client.post(
            "/api/notebooks/upload",
            files={"file": ("test_upload.ipynb", content, "application/json")},
        )
        assert resp.status_code == 200
        nb = resp.json()
        try:
            assert nb["title"] == "test_upload"  # .ipynb stripped
            assert nb["cell_count"] == 1
        finally:
            _cleanup_notebook(nb["id"])

    def test_upload_non_ipynb_rejected(self):
        resp = client.post(
            "/api/notebooks/upload",
            files={"file": ("test.csv", b"a,b\n1,2", "text/csv")},
        )
        assert resp.status_code == 400

    def test_upload_invalid_ipynb_rejected(self):
        resp = client.post(
            "/api/notebooks/upload",
            files={"file": ("bad.ipynb", b"not json", "application/json")},
        )
        assert resp.status_code == 400


# ── Kernel Execution Tests ───────────────────────────────────────────────────


class TestKernelExecution:
    def test_execute_single_cell(self):
        nb = _create_notebook("Exec Test")
        try:
            resp = client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "print('hello world')"},
            )
            assert resp.status_code == 200
            result = resp.json()
            assert result["status"] == "ok"
            # Should have stdout output
            stdout = [o for o in result["outputs"] if o.get("output_type") == "stream"]
            assert any("hello world" in o.get("text", "") for o in stdout)
        finally:
            # Shut down kernel before deleting
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_execute_cell_not_found(self):
        resp = client.post(
            "/api/notebooks/000000000000/execute",
            json={"code": "1+1"},
        )
        assert resp.status_code == 404

    def test_execute_all(self):
        nb = _create_notebook("Exec All Test")
        try:
            # Update with code cells
            cells = [
                {"cell_type": "code", "source": "x = 42", "metadata": {}},
                {"cell_type": "code", "source": "print(x)", "metadata": {}},
            ]
            client.put(f"/api/notebooks/{nb['id']}", json={"cells": cells})

            resp = client.post(f"/api/notebooks/{nb['id']}/execute-all")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["cells"]) == 2
            # Both should succeed
            assert all(r["status"] == "ok" for r in data["cells"])
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_execute_all_stops_on_error(self):
        nb = _create_notebook("Exec All Error Test")
        try:
            cells = [
                {"cell_type": "code", "source": "raise ValueError('boom')", "metadata": {}},
                {"cell_type": "code", "source": "print('should not run')", "metadata": {}},
            ]
            client.put(f"/api/notebooks/{nb['id']}", json={"cells": cells})

            resp = client.post(f"/api/notebooks/{nb['id']}/execute-all")
            assert resp.status_code == 200
            data = resp.json()
            # Should stop after first error — only 1 result
            assert len(data["cells"]) == 1
            assert data["cells"][0]["status"] == "error"
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_restart_kernel(self):
        nb = _create_notebook("Restart Test")
        try:
            # Execute to start a kernel
            client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "x = 99"},
            )
            # Restart
            resp = client.post(f"/api/notebooks/{nb['id']}/restart")
            assert resp.status_code == 200

            # Variable should be gone
            resp = client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "print(x)"},
            )
            result = resp.json()
            assert result["status"] == "error"
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_shutdown_kernel(self):
        nb = _create_notebook("Shutdown Test")
        try:
            # Start kernel
            client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "1+1"},
            )
            # Shutdown
            resp = client.post(f"/api/notebooks/{nb['id']}/shutdown")
            assert resp.status_code == 200
        finally:
            _cleanup_notebook(nb["id"])


# ── DataFrame Bridge Tests ───────────────────────────────────────────────────


class TestDataFrameBridge:
    def test_get_dataframes(self):
        nb = _create_notebook("DF Test")
        try:
            # Create a DataFrame in the kernel
            client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "import pandas as pd; df = pd.DataFrame({'a': [1,2,3], 'b': [4,5,6]})"},
            )

            resp = client.get(f"/api/notebooks/{nb['id']}/dataframes")
            assert resp.status_code == 200
            data = resp.json()
            assert "df" in data["dataframes"]
            assert data["dataframes"]["df"]["rows"] == 3
            assert set(data["dataframes"]["df"]["columns"]) == {"a", "b"}
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_get_dataframes_no_kernel(self):
        nb = _create_notebook("No Kernel DF Test")
        try:
            resp = client.get(f"/api/notebooks/{nb['id']}/dataframes")
            assert resp.status_code == 404
        finally:
            _cleanup_notebook(nb["id"])

    def test_dataframe_to_source(self):
        nb = _create_notebook("DF to Source Test")
        try:
            # Create a DataFrame in the kernel
            client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "import pandas as pd; sales = pd.DataFrame({'product': ['A','B'], 'revenue': [100, 200]})"},
            )

            resp = client.post(f"/api/notebooks/{nb['id']}/dataframes/sales/to-source")
            assert resp.status_code == 200
            data = resp.json()
            assert data["source_id"]
            assert data["filename"] == "sales.csv"
            assert data["row_count"] == 2
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])

    def test_dataframe_to_source_not_found(self):
        nb = _create_notebook("DF Not Found Test")
        try:
            # Start kernel without creating the DataFrame
            client.post(
                f"/api/notebooks/{nb['id']}/execute",
                json={"code": "x = 1"},
            )

            resp = client.post(f"/api/notebooks/{nb['id']}/dataframes/nonexistent/to-source")
            assert resp.status_code == 404
        finally:
            client.post(f"/api/notebooks/{nb['id']}/shutdown")
            _cleanup_notebook(nb["id"])
