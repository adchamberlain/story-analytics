"""
Regression test: paste endpoint uses a sentinel filename that can't collide
with real user uploads.

Bug: paste_text used "pasted_data.csv" as the filename. If a user had uploaded
a file literally named "pasted_data.csv", the paste handler would find and
destroy it via find_source_by_filename.
Fix: Changed to "__paste__.csv" — a name no real upload would use.
"""

import pytest

from api.routers.data import router


class TestPasteFilenameCollision:
    def test_paste_filename_is_not_common(self):
        """The paste sentinel filename must not be a plausible user upload name."""
        # Inspect the source to verify the sentinel
        import inspect
        source = inspect.getsource(router.routes[-1].endpoint)  # fragile; use grep instead

        # More robust: just check the actual data.py source text
        from pathlib import Path
        data_py = Path(__file__).parent.parent.parent / "api" / "routers" / "data.py"
        text = data_py.read_text()

        # The old sentinel "pasted_data.csv" should NOT appear in the paste handler
        # Only the new sentinel "__paste__.csv" should be used
        paste_section = text[text.index("paste_filename"):]
        paste_section = paste_section[:paste_section.index("return UploadResponse")]
        assert "pasted_data.csv" not in paste_section, (
            "paste handler still uses 'pasted_data.csv' — collides with real uploads"
        )
        assert "__paste__.csv" in paste_section
