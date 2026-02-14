"""
Chart storage: save and load chart configurations as JSON files.
Local-first, Git-friendly persistence.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict


CHARTS_DIR = Path(__file__).parent.parent.parent / "data" / "charts"


@dataclass
class SavedChart:
    """A persisted chart configuration."""
    id: str
    source_id: str
    chart_type: str
    title: str
    subtitle: str | None
    source: str | None
    sql: str
    x: str | None
    y: str | None
    series: str | None
    horizontal: bool
    sort: bool
    reasoning: str | None
    created_at: str
    updated_at: str
    config: dict | None = None  # Visual config blob (palette, toggles, axis labels)


def save_chart(
    source_id: str,
    chart_type: str,
    title: str,
    sql: str,
    x: str | None = None,
    y: str | None = None,
    series: str | None = None,
    horizontal: bool = False,
    sort: bool = True,
    subtitle: str | None = None,
    source: str | None = None,
    reasoning: str | None = None,
) -> SavedChart:
    """Save a chart configuration to disk."""
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)

    chart_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    chart = SavedChart(
        id=chart_id,
        source_id=source_id,
        chart_type=chart_type,
        title=title,
        subtitle=subtitle,
        source=source,
        sql=sql,
        x=x,
        y=y,
        series=series,
        horizontal=horizontal,
        sort=sort,
        reasoning=reasoning,
        created_at=now,
        updated_at=now,
    )

    path = CHARTS_DIR / f"{chart_id}.json"
    path.write_text(json.dumps(asdict(chart), indent=2))
    return chart


def load_chart(chart_id: str) -> SavedChart | None:
    """Load a chart configuration from disk."""
    path = CHARTS_DIR / f"{chart_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    return SavedChart(**data)


def list_charts() -> list[SavedChart]:
    """List all saved charts."""
    if not CHARTS_DIR.exists():
        return []

    charts = []
    for path in sorted(CHARTS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        data = json.loads(path.read_text())
        charts.append(SavedChart(**data))

    return charts


def update_chart(chart_id: str, **fields) -> SavedChart | None:
    """Update a chart configuration on disk. Merges provided fields."""
    path = CHARTS_DIR / f"{chart_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    now = datetime.now(timezone.utc).isoformat()

    for key, value in fields.items():
        if value is not None:
            data[key] = value

    data["updated_at"] = now
    path.write_text(json.dumps(data, indent=2))
    return SavedChart(**data)


def delete_chart(chart_id: str) -> bool:
    """Delete a chart configuration."""
    path = CHARTS_DIR / f"{chart_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
