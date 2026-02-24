"""Tests for Google Sheets connector: URL parsing and CSV import."""

import pytest
from api.services.connectors.google_sheets import (
    parse_sheets_url,
    build_export_url,
)


class TestSheetsUrlParsing:
    def test_standard_edit_url(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit"
        result = parse_sheets_url(url)
        assert result["sheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        assert result["gid"] is None

    def test_url_with_gid(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=123456"
        result = parse_sheets_url(url)
        assert result["sheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        assert result["gid"] == "123456"

    def test_url_with_gid_param(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit?gid=789"
        result = parse_sheets_url(url)
        assert result["gid"] == "789"

    def test_pub_url(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/pubhtml"
        result = parse_sheets_url(url)
        assert result["sheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"

    def test_export_url(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/export?format=csv"
        result = parse_sheets_url(url)
        assert result["sheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"

    def test_url_with_trailing_slash(self):
        url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/"
        result = parse_sheets_url(url)
        assert result["sheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"

    def test_invalid_url_raises(self):
        with pytest.raises(ValueError, match="not a valid Google Sheets URL"):
            parse_sheets_url("https://example.com/spreadsheet")

    def test_empty_url_raises(self):
        with pytest.raises(ValueError):
            parse_sheets_url("")

    def test_plain_sheet_id_raises(self):
        with pytest.raises(ValueError):
            parse_sheets_url("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms")


class TestBuildExportUrl:
    def test_without_gid(self):
        url = build_export_url("abc123")
        assert url == "https://docs.google.com/spreadsheets/d/abc123/export?format=csv"

    def test_with_gid(self):
        url = build_export_url("abc123", gid="456")
        assert url == "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=456"
