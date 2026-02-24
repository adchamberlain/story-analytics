"""
Google Sheets connector: parse public sheet URLs and fetch CSV exports.

The sheet must be publicly accessible (shared via link) for this to work.
No API key or OAuth is needed — we use the public CSV export endpoint.
"""

import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import httpx

# Matches the sheet ID from a Google Sheets URL
_SHEETS_RE = re.compile(
    r"docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)"
)


def parse_sheets_url(url: str) -> dict:
    """Parse a Google Sheets URL and extract sheet_id and optional gid.

    Returns:
        {"sheet_id": str, "gid": str | None}

    Raises:
        ValueError: If the URL is not a valid Google Sheets URL.
    """
    url = url.strip()
    if not url:
        raise ValueError("URL is empty")

    match = _SHEETS_RE.search(url)
    if not match:
        raise ValueError(f"This is not a valid Google Sheets URL: {url}")

    sheet_id = match.group(1)

    # Extract gid from fragment (#gid=123) or query param (?gid=123)
    gid = None
    parsed = urlparse(url)

    # Check fragment: #gid=123456
    if parsed.fragment:
        frag_params = parse_qs(parsed.fragment)
        if "gid" in frag_params:
            gid = frag_params["gid"][0]

    # Check query string: ?gid=123
    if not gid and parsed.query:
        query_params = parse_qs(parsed.query)
        if "gid" in query_params:
            gid = query_params["gid"][0]

    return {"sheet_id": sheet_id, "gid": gid}


def build_export_url(sheet_id: str, gid: str | None = None) -> str:
    """Build the public CSV export URL for a Google Sheets document."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:
        url += f"&gid={gid}"
    return url


async def fetch_sheet_csv(url: str, timeout: float = 30.0) -> Path:
    """Fetch CSV data from a Google Sheets export URL.

    Returns:
        Path to a temporary CSV file.

    Raises:
        httpx.HTTPStatusError: If the fetch fails.
        ValueError: If the response is not CSV-like content.
    """
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    # Verify we got something that looks like CSV (not an HTML error page)
    content = resp.content
    if content[:5] == b"<!DOC" or content[:5] == b"<html":
        raise ValueError(
            "Received HTML instead of CSV. Make sure the sheet is publicly accessible "
            "(Share → Anyone with the link)."
        )

    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    tmp.write(content)
    tmp.close()
    return Path(tmp.name)
