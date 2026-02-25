#!/bin/bash
# =====================================================
# AXIS — First-time config setup
# =====================================================
# Creates the custom/ directory structure and populates it from
# .example templates. Creates symlinks for branding and agent assets.
#
# Usage:
#   scripts/setup-config.sh              # Normal setup
#   scripts/setup-config.sh --force      # Move existing content into custom/
#   scripts/setup-config.sh --no-symlinks  # Copy instead of symlink (Windows)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE_DIR="$PROJECT_ROOT/backend/config"
CUSTOM_DIR="$PROJECT_ROOT/custom"
FRONTEND_PUBLIC="$PROJECT_ROOT/frontend/public"

FORCE=false
NO_SYMLINKS=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --no-symlinks) NO_SYMLINKS=true ;;
  esac
done

echo "Setting up AXIS custom/ directory..."

# --- 1. Create directory structure ---
mkdir -p "$CUSTOM_DIR/config" "$CUSTOM_DIR/branding" "$CUSTOM_DIR/agents"

# --- 2. Copy .example templates into custom/config/ (strip .example suffix) ---
copied=0
for example in "$EXAMPLE_DIR"/*.yaml.example; do
  [ -f "$example" ] || continue
  basename="$(basename "$example")"
  target="$CUSTOM_DIR/config/${basename%.example}"
  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    echo "  Created config/${basename%.example}"
    copied=$((copied + 1))
  else
    echo "  Skipped config/${basename%.example} (already exists)"
  fi
done

# --- 3. Symlink frontend/public/branding -> ../../custom/branding ---
_link_or_copy() {
  local link_path="$1"   # e.g. frontend/public/branding
  local target="$2"      # relative symlink target e.g. ../../custom/branding
  local abs_target="$3"  # absolute path to custom/branding
  local label="$4"       # display name

  if [ -L "$link_path" ]; then
    echo "  Skipped $label symlink (already exists)"
    return
  fi

  if [ -e "$link_path" ]; then
    # Something exists that is not a symlink
    # Check if it's empty or only contains .gitkeep
    local real_files
    real_files=$(find "$link_path" -not -name '.gitkeep' -not -path "$link_path" 2>/dev/null | head -1)

    if [ -n "$real_files" ]; then
      if [ "$FORCE" = true ]; then
        echo "  Moving existing $label content into custom/..."
        # Move contents (excluding .gitkeep) into custom target
        find "$link_path" -not -name '.gitkeep' -not -path "$link_path" -maxdepth 1 -exec mv {} "$abs_target/" \;
        rm -rf "$link_path"
      else
        echo "  WARNING: $link_path has existing content."
        echo "           Move files to $abs_target/ first, or use --force."
        return
      fi
    else
      # Empty dir or only .gitkeep — safe to replace
      rm -rf "$link_path"
    fi
  fi

  if [ "$NO_SYMLINKS" = true ]; then
    # Copy mode for Windows
    cp -r "$abs_target" "$link_path"
    echo "  Copied $label (--no-symlinks mode)"
  else
    ln -s "$target" "$link_path"
    echo "  Symlinked $label -> $target"
  fi
}

_link_or_copy \
  "$FRONTEND_PUBLIC/branding" \
  "../../custom/branding" \
  "$CUSTOM_DIR/branding" \
  "branding"

_link_or_copy \
  "$FRONTEND_PUBLIC/agents" \
  "../../custom/agents" \
  "$CUSTOM_DIR/agents" \
  "agents"

# --- 4. Summary ---
echo ""
if [ "$copied" -eq 0 ]; then
  echo "All config files already exist."
else
  echo "Created $copied config file(s)."
fi
echo ""
echo "Custom directory: custom/"
echo "  config/    YAML configuration files"
echo "  branding/  Hero images, logos, favicons"
echo "  agents/    Agent avatar images"
echo ""
echo "Override location with AXIS_CUSTOM_DIR env var."
