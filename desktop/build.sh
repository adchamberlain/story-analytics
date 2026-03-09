#!/usr/bin/env bash
# desktop/build.sh
#
# Builds the Story Analytics desktop app (.dmg) for macOS.
#
# Usage:
#   cd desktop && ./build.sh              # ARM64 (Apple Silicon)
#   cd desktop && ./build.sh --x64        # Intel (requires x86_64 Python via Rosetta)
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

# Determine architecture-specific settings
case "$ARCH_FLAG" in
  --x64|--x86_64|--intel)
    ARCH="x64"
    ARCH_LABEL="x64"
    ELECTRON_ARCH="--x64"
    ELECTRON_DIR_SUFFIX="mac"
    ;;
  --arm64|*)
    ARCH="arm64"
    ARCH_LABEL="arm64"
    ELECTRON_ARCH="--arm64"
    ELECTRON_DIR_SUFFIX="mac-arm64"
    ;;
esac

VENV_DIR="$DESKTOP_DIR/venv-$ARCH"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Story Analytics — Desktop Build"
echo "  Arch: $ARCH_LABEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Build React frontend ─────────────────────────────────────────────
echo ""
echo "▶ [1/5] Building React frontend..."
cd "$REPO_ROOT/app"
npm run build

# Copy built files to static/ in repo root (where FastAPI looks for them)
rm -rf "$REPO_ROOT/static"
cp -r "$REPO_ROOT/app/dist" "$REPO_ROOT/static"
echo "  → Copied app/dist/ → static/"

# ── Step 2: PyInstaller bundle ───────────────────────────────────────────────
echo ""
echo "▶ [2/5] Building Python bundle (PyInstaller)..."
cd "$REPO_ROOT"

# Use a separate venv per architecture to avoid mixing native binaries
if [ ! -d "$VENV_DIR" ]; then
  echo "  Creating isolated Python venv for $ARCH_LABEL bundling..."
  if [ "$ARCH" = "x64" ]; then
    echo "  → Using x86_64 Python via Rosetta..."
    # Require an x86_64 Python (installed via Homebrew under Rosetta or pyenv)
    X64_PYTHON=""
    for candidate in /usr/local/bin/python3 /usr/local/bin/python3.12 /usr/local/bin/python3.13; do
      if [ -x "$candidate" ]; then
        X64_PYTHON="$candidate"
        break
      fi
    done
    if [ -z "$X64_PYTHON" ]; then
      echo "ERROR: No x86_64 Python found. Install Python via Homebrew under Rosetta:"
      echo "  arch -x86_64 /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      echo "  arch -x86_64 /usr/local/bin/brew install python@3.12"
      exit 1
    fi
    echo "  → Found x86_64 Python: $X64_PYTHON"
    $X64_PYTHON -m venv "$VENV_DIR"
  else
    python3 -m venv "$VENV_DIR"
  fi
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  "$VENV_DIR/bin/pip" install --quiet -r requirements.txt
  "$VENV_DIR/bin/pip" install --quiet pyinstaller dmgbuild
fi

"$VENV_DIR/bin/pyinstaller" \
  desktop/story-analytics.spec \
  --clean \
  --noconfirm \
  --distpath desktop/dist-python

echo "  → Bundle written to desktop/dist-python/story-analytics-api/"

# ── Step 3: Install Electron dependencies ────────────────────────────────────
echo ""
echo "▶ [3/5] Installing Electron dependencies..."
cd "$DESKTOP_DIR"
npm install --prefer-offline

# ── Step 4: Package .app with electron-builder (dir target = no DMG) ─────────
echo ""
echo "▶ [4/5] Packaging Electron .app (signing)..."
# Use 'dir' target so electron-builder signs the .app but doesn't create a DMG.
# We create the DMG ourselves in step 5 so the background image is applied
# correctly (electron-builder silently drops backgrounds on APFS / Apple Silicon).
npx electron-builder --mac dir $ELECTRON_ARCH

APP_PATH="$DESKTOP_DIR/dist/$ELECTRON_DIR_SUFFIX/Story Analytics.app"

# ── Step 5: Create DMG with dmgbuild (supports APFS + custom backgrounds) ────
echo ""
echo "▶ [5/5] Creating DMG with background..."
VERSION=$(node -p "require('./package.json').version")
DMG_OUT="$DESKTOP_DIR/dist/Story Analytics-${VERSION}-${ARCH_LABEL}.dmg"
rm -f "$DMG_OUT"

"$VENV_DIR/bin/dmgbuild" \
  -s "$DESKTOP_DIR/dmgbuild-settings.py" \
  -D "app=$APP_PATH" \
  -D "desktop=$DESKTOP_DIR" \
  "Install Story Analytics" \
  "$DMG_OUT"

echo "  → DMG written to $DMG_OUT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build complete!"
echo "  DMG: $DMG_OUT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
