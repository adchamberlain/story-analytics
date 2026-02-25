"""Tests for data transform endpoints."""

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _upload_csv(csv_text: str, filename: str = "test.csv") -> str:
    """Helper: upload CSV text via paste endpoint and return source_id."""
    resp = client.post(
        "/api/data/paste",
        json={"data": csv_text, "name": filename},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["source_id"]


class TestTransposeTransform:
    def test_transpose_swaps_rows_and_columns(self):
        sid = _upload_csv("name,age,city\nAlice,30,NYC\nBob,25,LA")
        resp = client.post(f"/api/data/{sid}/transform/transpose")
        assert resp.status_code == 200
        data = resp.json()
        # After transpose: columns = ["field", "Alice", "Bob"]
        assert data["columns"][0] == "field"
        assert len(data["columns"]) == 3  # field + 2 original rows
        # Rows: age, city (first col 'name' becomes new column headers)
        assert data["row_count"] == 2

    def test_transpose_single_row(self):
        sid = _upload_csv("name,age\nAlice,30")
        resp = client.post(f"/api/data/{sid}/transform/transpose")
        assert resp.status_code == 200
        data = resp.json()
        # After transpose: columns = ["field", "Alice"], row for "age"
        assert data["columns"][0] == "field"
        assert len(data["columns"]) == 2
        assert data["row_count"] == 1


class TestRenameColumn:
    def test_rename_column(self):
        sid = _upload_csv("name,age\nAlice,30")
        resp = client.post(
            f"/api/data/{sid}/transform/rename-column",
            json={"old": "name", "new": "full_name"},
        )
        assert resp.status_code == 200
        assert "full_name" in resp.json()["columns"]
        assert "name" not in resp.json()["columns"]

    def test_rename_nonexistent_column_404(self):
        sid = _upload_csv("name,age\nAlice,30")
        resp = client.post(
            f"/api/data/{sid}/transform/rename-column",
            json={"old": "missing", "new": "x"},
        )
        assert resp.status_code == 404


class TestDeleteColumn:
    def test_delete_column(self):
        sid = _upload_csv("name,age,city\nAlice,30,NYC")
        resp = client.post(
            f"/api/data/{sid}/transform/delete-column",
            json={"column": "city"},
        )
        assert resp.status_code == 200
        assert "city" not in resp.json()["columns"]
        assert len(resp.json()["columns"]) == 2

    def test_delete_nonexistent_column_404(self):
        sid = _upload_csv("name,age\nAlice,30")
        resp = client.post(
            f"/api/data/{sid}/transform/delete-column",
            json={"column": "missing"},
        )
        assert resp.status_code == 404


class TestReorderColumns:
    def test_reorder_columns(self):
        sid = _upload_csv("a,b,c\n1,2,3")
        resp = client.post(
            f"/api/data/{sid}/transform/reorder-columns",
            json={"columns": ["c", "a", "b"]},
        )
        assert resp.status_code == 200
        assert resp.json()["columns"] == ["c", "a", "b"]

    def test_reorder_with_missing_column_404(self):
        sid = _upload_csv("a,b,c\n1,2,3")
        resp = client.post(
            f"/api/data/{sid}/transform/reorder-columns",
            json={"columns": ["c", "a", "missing"]},
        )
        assert resp.status_code == 404


class TestRoundTransform:
    def test_round_column(self):
        sid = _upload_csv("val\n3.14159\n2.71828")
        resp = client.post(
            f"/api/data/{sid}/transform/round",
            json={"column": "val", "decimals": 2},
        )
        assert resp.status_code == 200
        rows = resp.json()["rows"]
        assert rows[0]["val"] == 3.14
        assert rows[1]["val"] == 2.72


class TestPrependAppend:
    def test_prepend_and_append(self):
        sid = _upload_csv("price\n100\n200")
        resp = client.post(
            f"/api/data/{sid}/transform/prepend-append",
            json={"column": "price", "prepend": "$", "append": " USD"},
        )
        assert resp.status_code == 200
        rows = resp.json()["rows"]
        assert rows[0]["price"] == "$100 USD"
        assert rows[1]["price"] == "$200 USD"


class TestEditCell:
    def test_edit_single_cell(self):
        sid = _upload_csv("name,age\nAlice,30\nBob,25")
        resp = client.post(
            f"/api/data/{sid}/transform/edit-cell",
            json={"row": 0, "column": "name", "value": "Alicia"},
        )
        assert resp.status_code == 200
        assert resp.json()["rows"][0]["name"] == "Alicia"

    def test_edit_cell_out_of_range(self):
        sid = _upload_csv("name,age\nAlice,30")
        resp = client.post(
            f"/api/data/{sid}/transform/edit-cell",
            json={"row": 5, "column": "name", "value": "X"},
        )
        assert resp.status_code == 400

    def test_edit_cell_null_value(self):
        sid = _upload_csv("name,age\nAlice,30\nBob,25")
        resp = client.post(
            f"/api/data/{sid}/transform/edit-cell",
            json={"row": 1, "column": "name", "value": None},
        )
        assert resp.status_code == 200
        # None becomes empty string in CSV -> NULL or empty after ingest


class TestCastType:
    def test_cast_to_number(self):
        sid = _upload_csv("val\n100\n200\nthree")
        resp = client.post(
            f"/api/data/{sid}/transform/cast-type",
            json={"column": "val", "type": "number"},
        )
        assert resp.status_code == 200
        rows = resp.json()["rows"]
        assert rows[0]["val"] == 100.0
        assert rows[1]["val"] == 200.0
        # "three" becomes empty -> DuckDB ingests as NULL
        assert rows[2]["val"] is None

    def test_cast_to_text(self):
        sid = _upload_csv("num\n1\n2\n3")
        resp = client.post(
            f"/api/data/{sid}/transform/cast-type",
            json={"column": "num", "type": "text"},
        )
        assert resp.status_code == 200
        # After cast to text, values should be present
        rows = resp.json()["rows"]
        assert len(rows) == 3


class TestTransformSourceNotFound:
    def test_invalid_source_id(self):
        resp = client.post("/api/data/nonexistent123/transform/transpose")
        assert resp.status_code in (400, 404, 422)

    def test_nonexistent_source(self):
        resp = client.post("/api/data/aabbccddeeff/transform/transpose")
        assert resp.status_code == 404
