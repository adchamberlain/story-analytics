# desktop/dmgbuild-settings.py
# dmgbuild settings for Story Analytics DMG installer.
#
# Usage (from repo root):
#   desktop/venv/bin/dmgbuild \
#     -s desktop/dmgbuild-settings.py \
#     "Install Story Analytics" \
#     "desktop/dist/Story Analytics-1.0.0-arm64.dmg"
#
# Accepts defines:
#   -D app=<path to .app>
#   -D out=<path to output .dmg>

import os

# All paths are passed in via -D defines from build.sh (absolute paths).
# Fallbacks point relative to wherever dmgbuild is run from.
APP_PATH    = defines["app"]
DESKTOP_DIR = defines["desktop"]
APP_NAME    = os.path.basename(APP_PATH)  # "Story Analytics.app"

# ── DMG format ───────────────────────────────────────────────────────────────
# ULFO = LZFSE-compressed APFS (fast, supported macOS 10.12+)
format = "ULFO"
size = None  # auto-calculate

# ── Contents ─────────────────────────────────────────────────────────────────
files    = [APP_PATH]
symlinks = {"Applications": "/Applications"}

# ── Appearance ───────────────────────────────────────────────────────────────
background = os.path.join(DESKTOP_DIR, "assets/dmg-background.png")
icon       = os.path.join(DESKTOP_DIR, "assets/icon.icns")
icon_size  = 100
text_size  = 13

window_rect = ((100, 100), (600, 380))

icon_locations = {
    APP_NAME:       (160, 160),
    "Applications": (440, 160),
}
