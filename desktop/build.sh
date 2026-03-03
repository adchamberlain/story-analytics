#!/usr/bin/env bash
# desktop/build.sh
#
# Builds the Story Analytics desktop app (.dmg) for macOS.
#
# Usage:
#   cd desktop && ./build.sh              # ARM64 (Apple Silicon)
#   cd desktop && ./build.sh --x64       # Intel
#   cd desktop && ./build.sh --universal  # Both (fat binary, ~2x size)
#
# For a signed + notarized build, set these env vars first:
#   export APPLE_ID="you@example.com"
#   export APPLE_TEAM_ID="XXXXXXXXXX"
#   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#
# Output: desktop/dist/Story Analytics-*.dmg

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DESKTOP_DIR/.." && pwd)"

ARCH_FLAG="${1:---arm64}"  # default: Apple Silicon

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Story Analytics — Desktop Build"
echo "  Arch: $ARCH_FLAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Build React frontend ─────────────────────────────────────────────
echo ""
echo "▶ [1/4] Building React frontend..."
cd "$REPO_ROOT/app"
npm run build

# Copy built files to static/ in repo root (where FastAPI looks for them)
rm -rf "$REPO_ROOT/static"
cp -r "$REPO_ROOT/app/dist" "$REPO_ROOT/static"
echo "  → Copied app/dist/ → static/"

# ── Step 2: PyInstaller bundle ───────────────────────────────────────────────
echo ""
echo "▶ [2/4] Building Python bundle (PyInstaller)..."
cd "$REPO_ROOT"

# Use a clean venv for the bundle to avoid dev deps contaminating it
if [ ! -d "$DESKTOP_DIR/venv" ]; then
  echo "  Creating isolated Python venv for bundling..."
  python3 -m venv "$DESKTOP_DIR/venv"
  "$DESKTOP_DIR/venv/bin/pip" install --quiet --upgrade pip
  "$DESKTOP_DIR/venv/bin/pip" install --quiet -r requirements.txt
  "$DESKTOP_DIR/venv/bin/pip" install --quiet pyinstaller
fi

"$DESKTOP_DIR/venv/bin/pyinstaller" \
  desktop/story-analytics.spec \
  --clean \
  --noconfirm \
  --distpath desktop/dist-python

echo "  → Bundle written to desktop/dist-python/story-analytics-api/"

# ── Step 3: Install Electron dependencies ────────────────────────────────────
echo ""
echo "▶ [3/4] Installing Electron dependencies..."
cd "$DESKTOP_DIR"
npm install --prefer-offline

# ── Step 4: Package with electron-builder ────────────────────────────────────
echo ""
echo "▶ [4/4] Packaging Electron app..."
npx electron-builder --mac "$ARCH_FLAG"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build complete!"
echo "  DMG: $(ls "$DESKTOP_DIR/dist/"*.dmg 2>/dev/null | head -1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
