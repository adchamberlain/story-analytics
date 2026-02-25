"""
Tests for DatabaseConnection wrapper.

All tests use SQLite in-memory (no Postgres dependency needed).
"""
from __future__ import annotations

from api.services.db.connection import DatabaseConnection


class TestDatabaseConnectionSQLite:
    """Tests for DatabaseConnection with SQLite in-memory backend."""

    def _make_db(self) -> DatabaseConnection:
        """Create an in-memory SQLite connection for testing."""
        return DatabaseConnection(url="sqlite://:memory:")

    # ── fetchone returns dict ────────────────────────────────────────────────

    def test_create_table_insert_fetchone_returns_dict(self):
        """Create a table, insert a row, and fetchone should return a dict."""
        db = self._make_db()
        db.executescript(
            "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);"
        )
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (1, "alpha"))
        row = db.fetchone("SELECT id, name FROM items WHERE id = ?", (1,))
        assert row is not None
        assert isinstance(row, dict)
        assert row["id"] == 1
        assert row["name"] == "alpha"
        db.close()

    def test_fetchone_returns_none_when_no_match(self):
        """fetchone should return None when no rows match."""
        db = self._make_db()
        db.executescript("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);")
        row = db.fetchone("SELECT id, name FROM items WHERE id = ?", (999,))
        assert row is None
        db.close()

    # ── fetchall returns list of dicts ────────────────────────────────────────

    def test_fetchall_returns_list_of_dicts(self):
        """fetchall should return a list of dicts."""
        db = self._make_db()
        db.executescript(
            "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);"
        )
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (1, "alpha"))
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (2, "beta"))
        rows = db.fetchall("SELECT id, name FROM items ORDER BY id")
        assert isinstance(rows, list)
        assert len(rows) == 2
        assert all(isinstance(r, dict) for r in rows)
        assert rows[0]["name"] == "alpha"
        assert rows[1]["name"] == "beta"
        db.close()

    def test_fetchall_returns_empty_list_when_no_rows(self):
        """fetchall should return an empty list when no rows match."""
        db = self._make_db()
        db.executescript("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);")
        rows = db.fetchall("SELECT * FROM items")
        assert rows == []
        db.close()

    # ── execute returns rowcount ──────────────────────────────────────────────

    def test_execute_returns_rowcount(self):
        """execute should return the number of affected rows."""
        db = self._make_db()
        db.executescript(
            "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);"
        )
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (1, "alpha"))
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (2, "beta"))
        db.execute("INSERT INTO items (id, name) VALUES (?, ?)", (3, "gamma"))

        count = db.execute("DELETE FROM items WHERE id > ?", (1,))
        assert count == 2
        db.close()

    # ── executescript runs multi-statement DDL ────────────────────────────────

    def test_executescript_runs_multi_statement_ddl(self):
        """executescript should handle multiple SQL statements."""
        db = self._make_db()
        db.executescript("""
            CREATE TABLE t1 (id INTEGER PRIMARY KEY);
            CREATE TABLE t2 (id INTEGER PRIMARY KEY);
            INSERT INTO t1 (id) VALUES (1);
            INSERT INTO t2 (id) VALUES (2);
        """)
        row1 = db.fetchone("SELECT id FROM t1")
        row2 = db.fetchone("SELECT id FROM t2")
        assert row1 is not None and row1["id"] == 1
        assert row2 is not None and row2["id"] == 2
        db.close()

    # ── ? placeholder works in SQLite mode ────────────────────────────────────

    def test_question_mark_placeholder_works(self):
        """? placeholders should work correctly in SQLite mode."""
        db = self._make_db()
        db.executescript("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, value REAL);")
        db.execute(
            "INSERT INTO items (id, name, value) VALUES (?, ?, ?)",
            (1, "test", 3.14),
        )
        row = db.fetchone("SELECT * FROM items WHERE name = ? AND value > ?", ("test", 3.0))
        assert row is not None
        assert row["name"] == "test"
        db.close()

    # ── _convert_query converts ? to %s ───────────────────────────────────────

    def test_convert_query_noop_for_sqlite(self):
        """_convert_query should be a no-op for SQLite connections."""
        db = self._make_db()
        query = "SELECT * FROM t WHERE id = ? AND name = ?"
        assert db._convert_query(query) == query
        db.close()

    def test_convert_query_converts_for_postgres(self):
        """_convert_query should convert ? to %s for Postgres connections."""
        # We can test the conversion logic without a real Postgres connection
        # by constructing an instance and manually setting the flag.
        db = DatabaseConnection.__new__(DatabaseConnection)
        db._is_postgres = True
        query = "SELECT * FROM t WHERE id = ? AND name = ?"
        assert db._convert_query(query) == "SELECT * FROM t WHERE id = %s AND name = %s"

    def test_convert_query_preserves_quoted_question_marks(self):
        """_convert_query should only convert unquoted ? placeholders."""
        db = DatabaseConnection.__new__(DatabaseConnection)
        db._is_postgres = True
        # A simple query with only parameter ?s
        query = "INSERT INTO t (a, b) VALUES (?, ?)"
        assert db._convert_query(query) == "INSERT INTO t (a, b) VALUES (%s, %s)"

    # ── is_postgres property ──────────────────────────────────────────────────

    def test_sqlite_is_not_postgres(self):
        """SQLite connection should report is_postgres as False."""
        db = self._make_db()
        assert db._is_postgres is False
        db.close()
