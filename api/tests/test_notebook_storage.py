"""
Tests for notebook_storage CRUD operations.
"""

import json

import pytest

from api.services.notebook_storage import (
    NotebookMeta,
    create_notebook,
    create_notebook_from_ipynb,
    get_notebook,
    list_notebooks,
    update_notebook,
    delete_notebook,
)


class TestCreateNotebook:
    def test_creates_with_defaults(self):
        meta = create_notebook("My Notebook")
        assert isinstance(meta, NotebookMeta)
        assert meta.title == "My Notebook"
        assert meta.cell_count == 1  # default welcome cell
        assert len(meta.id) == 12
        assert meta.created_at
        assert meta.updated_at

    def test_creates_with_custom_cells(self):
        cells = [
            {"cell_type": "code", "source": ["print('hello')"], "metadata": {}},
            {"cell_type": "markdown", "source": ["# Title"], "metadata": {}},
        ]
        meta = create_notebook("Custom", cells=cells)
        assert meta.cell_count == 2

    def test_stored_as_valid_ipynb(self):
        meta = create_notebook("Test NB")
        data = get_notebook(meta.id)
        assert data is not None
        assert data["nbformat"] == 4
        assert data["metadata"]["title"] == "Test NB"
        assert len(data["cells"]) == 1
        assert data["cells"][0]["cell_type"] == "markdown"


class TestCreateFromIpynb:
    def test_imports_ipynb_content(self):
        ipynb = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {"cell_type": "code", "source": ["x = 1"], "metadata": {}},
            ],
        }
        content = json.dumps(ipynb).encode("utf-8")
        meta = create_notebook_from_ipynb(content, "analysis.ipynb")
        assert meta.title == "analysis"  # stripped .ipynb
        assert meta.cell_count == 1

    def test_preserves_existing_title(self):
        ipynb = {
            "nbformat": 4,
            "metadata": {"title": "My Analysis"},
            "cells": [],
        }
        content = json.dumps(ipynb).encode("utf-8")
        meta = create_notebook_from_ipynb(content, "other_name.ipynb")
        assert meta.title == "My Analysis"

    def test_stores_full_ipynb(self):
        ipynb = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {"custom_key": "value"},
            "cells": [
                {"cell_type": "code", "source": ["1+1"], "metadata": {}},
            ],
        }
        content = json.dumps(ipynb).encode("utf-8")
        meta = create_notebook_from_ipynb(content, "test.ipynb")
        data = get_notebook(meta.id)
        assert data["metadata"]["custom_key"] == "value"
        assert data["cells"][0]["source"] == ["1+1"]


class TestGetNotebook:
    def test_returns_none_for_missing(self):
        assert get_notebook("000000000000") is None

    def test_returns_none_for_invalid_id(self):
        assert get_notebook("../etc/passwd") is None

    def test_returns_full_ipynb(self):
        meta = create_notebook("Get Test")
        data = get_notebook(meta.id)
        assert data is not None
        assert data["metadata"]["title"] == "Get Test"


class TestListNotebooks:
    def test_empty_list(self):
        # May include notebooks from other tests, but shouldn't error
        result = list_notebooks()
        assert isinstance(result, list)

    def test_lists_created_notebooks(self):
        meta1 = create_notebook("List A")
        meta2 = create_notebook("List B")
        result = list_notebooks()
        ids = [n.id for n in result]
        assert meta1.id in ids
        assert meta2.id in ids

    def test_sorted_by_updated_at_desc(self):
        create_notebook("Older")
        create_notebook("Newer")
        result = list_notebooks()
        # All timestamps should be in descending order
        timestamps = [n.updated_at for n in result]
        assert timestamps == sorted(timestamps, reverse=True)


class TestUpdateNotebook:
    def test_update_title(self):
        meta = create_notebook("Original")
        updated = update_notebook(meta.id, title="Renamed")
        assert updated is not None
        assert updated.title == "Renamed"
        # Verify persisted
        data = get_notebook(meta.id)
        assert data["metadata"]["title"] == "Renamed"

    def test_update_cells(self):
        meta = create_notebook("Cells Test")
        new_cells = [
            {"cell_type": "code", "source": ["x = 42"], "metadata": {}},
        ]
        updated = update_notebook(meta.id, cells=new_cells)
        assert updated is not None
        assert updated.cell_count == 1
        data = get_notebook(meta.id)
        assert data["cells"][0]["source"] == ["x = 42"]

    def test_update_bumps_timestamp(self):
        meta = create_notebook("Timestamp Test")
        original_updated = meta.updated_at
        updated = update_notebook(meta.id, title="Changed")
        assert updated.updated_at >= original_updated

    def test_update_missing_returns_none(self):
        assert update_notebook("000000000000", title="Nope") is None

    def test_update_invalid_id_returns_none(self):
        assert update_notebook("bad-id!", title="Nope") is None


class TestDeleteNotebook:
    def test_delete_existing(self):
        meta = create_notebook("To Delete")
        assert delete_notebook(meta.id) is True
        assert get_notebook(meta.id) is None

    def test_delete_missing_returns_false(self):
        assert delete_notebook("000000000000") is False

    def test_delete_invalid_id_returns_false(self):
        assert delete_notebook("../../bad") is False
