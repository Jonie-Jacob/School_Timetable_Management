#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-layer.sh — Build the @timetable/shared Lambda Layer
#
# Packages the shared library + its production dependencies into a zip file
# compatible with the Lambda nodejs22.x runtime.
#
# Usage:
#   ./scripts/build-layer.sh
#
# Output:
#   layers/shared/shared-layer.zip
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SHARED_PKG="$PROJECT_ROOT/packages/shared"
LAYER_DIR="$PROJECT_ROOT/layers/shared"
BUILD_DIR="$LAYER_DIR/.build"

echo "==> Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/nodejs/node_modules/@timetable/shared"

echo "==> Building @timetable/shared..."
cd "$SHARED_PKG"
npx prisma generate 2>/dev/null || true
npx tsc --project tsconfig.json

echo "==> Copying compiled output..."
cp -r "$SHARED_PKG/dist" "$BUILD_DIR/nodejs/node_modules/@timetable/shared/dist"
cp "$SHARED_PKG/package.json" "$BUILD_DIR/nodejs/node_modules/@timetable/shared/package.json"

echo "==> Installing production dependencies..."
cd "$BUILD_DIR/nodejs/node_modules/@timetable/shared"
npm install --omit=dev --ignore-scripts 2>/dev/null

# Prisma client needs the engine binary
if [ -d "$SHARED_PKG/node_modules/.prisma" ]; then
  echo "==> Copying Prisma client engine..."
  mkdir -p "$BUILD_DIR/nodejs/node_modules/.prisma"
  cp -r "$SHARED_PKG/node_modules/.prisma/client" "$BUILD_DIR/nodejs/node_modules/.prisma/client"
fi

if [ -d "$SHARED_PKG/node_modules/@prisma" ]; then
  mkdir -p "$BUILD_DIR/nodejs/node_modules/@prisma"
  cp -r "$SHARED_PKG/node_modules/@prisma/client" "$BUILD_DIR/nodejs/node_modules/@prisma/client" 2>/dev/null || true
fi

echo "==> Creating zip..."
cd "$BUILD_DIR"
zip -r "$LAYER_DIR/shared-layer.zip" nodejs/ -q

LAYER_SIZE=$(du -sh "$LAYER_DIR/shared-layer.zip" | cut -f1)
echo "==> Layer built: layers/shared/shared-layer.zip ($LAYER_SIZE)"

echo "==> Cleaning build directory..."
rm -rf "$BUILD_DIR"

echo "==> Done!"
