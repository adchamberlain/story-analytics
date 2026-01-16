"""
Brand configuration management.

Loads brand settings and generates CSS custom properties.
"""

from pathlib import Path
from typing import Any

import yaml


DEFAULT_COLORS = {
    "primary": "#1d81a2",
    "accent": "#f2a83b",
    "heading": "#1a1a1a",
    "text": "#333333",
    "muted": "#666666",
    "background": "#ffffff",
    "background_subtle": "#f9f9f9",
    "border": "#e5e5e5",
}

DEFAULT_TYPOGRAPHY = {
    "heading_font": "Inter",
    "body_font": "Inter",
    "base_size": "1",
}

DEFAULT_CHART_PALETTE = [
    "#1d81a2",  # Primary blue
    "#6cc0e0",  # Light blue
    "#f2a83b",  # Warm accent
    "#e15759",  # Alert red
    "#59a14f",  # Success green
    "#9c755f",  # Brown/neutral
]

DEFAULT_LAYOUT = {
    "max_width": 900,
    "show_evidence_branding": True,
}


def load_brand_config(config_path: Path | None = None) -> dict[str, Any]:
    """Load brand configuration from YAML file."""
    if config_path is None:
        config_path = Path("brand_config.yaml")

    if not config_path.exists():
        return {}

    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def get_effective_config(config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get effective config with defaults applied."""
    if config is None:
        config = load_brand_config()

    return {
        "brand": config.get("brand", {}),
        "colors": {**DEFAULT_COLORS, **{k: v for k, v in config.get("colors", {}).items() if v}},
        "typography": {**DEFAULT_TYPOGRAPHY, **{k: v for k, v in config.get("typography", {}).items() if v}},
        "charts": {
            "palette": config.get("charts", {}).get("palette") or DEFAULT_CHART_PALETTE,
            "show_gridlines": config.get("charts", {}).get("show_gridlines", True),
            "gridline_color": config.get("charts", {}).get("gridline_color") or DEFAULT_COLORS["border"],
        },
        "layout": {**DEFAULT_LAYOUT, **{k: v for k, v in config.get("layout", {}).items() if v}},
    }


def generate_css_variables(config: dict[str, Any] | None = None) -> str:
    """Generate CSS custom properties from brand config."""
    effective = get_effective_config(config)
    colors = effective["colors"]
    typography = effective["typography"]
    layout = effective["layout"]
    charts = effective["charts"]

    css_lines = [
        "/* Auto-generated brand CSS variables */",
        "/* Do not edit directly - modify brand_config.yaml instead */",
        "",
        ":root {",
        f"  /* Colors */",
        f"  --brand-primary: {colors['primary']};",
        f"  --brand-accent: {colors['accent']};",
        f"  --brand-heading: {colors['heading']};",
        f"  --brand-text: {colors['text']};",
        f"  --brand-muted: {colors['muted']};",
        f"  --brand-background: {colors['background']};",
        f"  --brand-background-subtle: {colors['background_subtle']};",
        f"  --brand-border: {colors['border']};",
        "",
        f"  /* Typography */",
        f"  --brand-heading-font: '{typography['heading_font']}', system-ui, sans-serif;",
        f"  --brand-body-font: '{typography['body_font']}', system-ui, sans-serif;",
        f"  --brand-base-size: {typography['base_size']}rem;",
        "",
        f"  /* Layout */",
        f"  --brand-max-width: {layout['max_width']}px;",
        "",
        f"  /* Charts */",
        f"  --brand-gridline-color: {charts['gridline_color']};",
        "}",
        "",
        "/* Apply brand variables to Datawrapper theme */",
        ":root {",
        "  --datawrapper-heading-color: var(--brand-heading);",
        "  --datawrapper-text-color: var(--brand-text);",
        "  --datawrapper-muted-color: var(--brand-muted);",
        "  --datawrapper-border-color: var(--brand-border);",
        "  --datawrapper-bg-subtle: var(--brand-background-subtle);",
        "}",
        "",
        "/* Typography overrides */",
        "h1.markdown, h1.title, h2.markdown, h3.markdown, h4.markdown, h5.markdown, h6.markdown {",
        "  font-family: var(--brand-heading-font);",
        "}",
        "",
        ".markdown, p.markdown, li.markdown {",
        "  font-family: var(--brand-body-font);",
        "}",
        "",
        "body {",
        "  font-size: var(--brand-base-size);",
        "  background-color: var(--brand-background);",
        "}",
        "",
        "article.markdown {",
        "  max-width: var(--brand-max-width);",
        "}",
        "",
        "/* Link and accent colors */",
        "a.markdown:hover {",
        "  color: var(--brand-primary);",
        "}",
        "",
        "select:hover, select:focus {",
        "  border-color: var(--brand-primary);",
        "}",
        "",
        "select:focus {",
        f"  box-shadow: 0 0 0 2px {colors['primary']}33;",
        "}",
    ]

    # Add brand logo CSS if configured
    brand = effective.get("brand", {})
    if brand.get("logo"):
        css_lines.extend([
            "",
            "/* Brand logo */",
            ".brand-logo {",
            f"  background-image: url('/static/{brand['logo']}');",
            "  background-repeat: no-repeat;",
            "  background-size: contain;",
            "  height: 40px;",
            "}",
        ])

    # Hide Evidence branding if configured
    if not layout.get("show_evidence_branding", True):
        css_lines.extend([
            "",
            "/* Hide Evidence branding */",
            ".evidence-footer-branding {",
            "  display: none;",
            "}",
        ])

    return "\n".join(css_lines)


def write_brand_css(output_path: Path | None = None) -> Path:
    """Generate and write brand CSS file."""
    if output_path is None:
        output_path = Path(".evidence/template/src/brand.css")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    css_content = generate_css_variables()
    output_path.write_text(css_content)

    return output_path


def update_evidence_config_colors(config: dict[str, Any] | None = None) -> None:
    """Update evidence.config.yaml with brand colors."""
    effective = get_effective_config(config)
    colors = effective["colors"]
    palette = effective["charts"]["palette"]

    evidence_config_path = Path("evidence.config.yaml")
    if not evidence_config_path.exists():
        return

    with open(evidence_config_path) as f:
        evidence_config = yaml.safe_load(f)

    # Update color palettes
    if "theme" not in evidence_config:
        evidence_config["theme"] = {}

    evidence_config["theme"]["colorPalettes"] = {
        "default": {
            "light": palette,
            "dark": palette,
        }
    }

    evidence_config["theme"]["colors"] = {
        "primary": {"light": colors["primary"], "dark": colors["primary"]},
        "accent": {"light": colors["accent"], "dark": colors["accent"]},
        "base": {"light": colors["background"], "dark": "#1a1a1a"},
        "info": {"light": colors["primary"], "dark": colors["primary"]},
        "positive": {"light": "#59a14f", "dark": "#59a14f"},
        "warning": {"light": colors["accent"], "dark": colors["accent"]},
        "negative": {"light": "#e15759", "dark": "#e15759"},
    }

    with open(evidence_config_path, "w") as f:
        yaml.dump(evidence_config, f, default_flow_style=False, sort_keys=False)


if __name__ == "__main__":
    # CLI for testing
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "generate":
        css_path = write_brand_css()
        print(f"Generated brand CSS: {css_path}")
    else:
        print(generate_css_variables())
