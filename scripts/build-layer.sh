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
# Check both package-level and root-level node_modules (npm hoists to root)
PRISMA_SOURCE=""
if [ -d "$SHARED_PKG/node_modules/.prisma" ]; then
  PRISMA_SOURCE="$SHARED_PKG/node_modules"
elif [ -d "$PROJECT_ROOT/node_modules/.prisma" ]; then
  PRISMA_SOURCE="$PROJECT_ROOT/node_modules"
fi

if [ -n "$PRISMA_SOURCE" ]; then
  echo "==> Copying Prisma client engine from $PRISMA_SOURCE..."
  mkdir -p "$BUILD_DIR/nodejs/node_modules/.prisma"
  cp -r "$PRISMA_SOURCE/.prisma/client" "$BUILD_DIR/nodejs/node_modules/.prisma/client"

  # Remove non-Linux engines to save space
  rm -f "$BUILD_DIR/nodejs/node_modules/.prisma/client/query_engine-windows.dll.node" 2>/dev/null
  rm -f "$BUILD_DIR/nodejs/node_modules/.prisma/client/query_engine_bg.wasm" 2>/dev/null
  rm -f "$BUILD_DIR/nodejs/node_modules/.prisma/client/query_engine_bg.js" 2>/dev/null
  rm -f "$BUILD_DIR/nodejs/node_modules/.prisma/client/wasm-edge-light-loader.mjs" 2>/dev/null
  rm -f "$BUILD_DIR/nodejs/node_modules/.prisma/client/wasm-worker-loader.mjs" 2>/dev/null
  echo "  Kept Linux engine, removed Windows/WASM engines"
fi

PRISMA_CLIENT_SOURCE=""
if [ -d "$SHARED_PKG/node_modules/@prisma/client" ]; then
  PRISMA_CLIENT_SOURCE="$SHARED_PKG/node_modules/@prisma"
elif [ -d "$PROJECT_ROOT/node_modules/@prisma/client" ]; then
  PRISMA_CLIENT_SOURCE="$PROJECT_ROOT/node_modules/@prisma"
fi

if [ -n "$PRISMA_CLIENT_SOURCE" ]; then
  mkdir -p "$BUILD_DIR/nodejs/node_modules/@prisma"
  cp -r "$PRISMA_CLIENT_SOURCE/client" "$BUILD_DIR/nodejs/node_modules/@prisma/client" 2>/dev/null || true
  cp -r "$PRISMA_CLIENT_SOURCE/client-runtime-utils" "$BUILD_DIR/nodejs/node_modules/@prisma/client-runtime-utils" 2>/dev/null || true

  # Remove ALL WASM/edge runtimes and source maps — Lambda uses native library engine only
  RUNTIME_DIR="$BUILD_DIR/nodejs/node_modules/@prisma/client/runtime"
  rm -f "$RUNTIME_DIR"/query_compiler_*.* 2>/dev/null
  rm -f "$RUNTIME_DIR"/wasm-compiler-edge.* 2>/dev/null
  rm -f "$RUNTIME_DIR"/index-browser.* 2>/dev/null
  rm -f "$RUNTIME_DIR"/*.map 2>/dev/null
  echo "  Removed all WASM/edge/sourcemaps from @prisma/client/runtime"
fi

echo "==> Creating zip..."
cd "$BUILD_DIR"
rm -f "$LAYER_DIR/shared-layer.zip"
if command -v zip &>/dev/null; then
  zip -r "$LAYER_DIR/shared-layer.zip" nodejs/ -q
elif [ -f "/c/Program Files/7-Zip/7z.exe" ]; then
  # Windows: use 7-Zip for better compression than PowerShell
  "/c/Program Files/7-Zip/7z.exe" a -tzip -mx=9 "$(cygpath -w "$LAYER_DIR/shared-layer.zip")" nodejs/ > /dev/null
else
  # Windows fallback using PowerShell (poor compression)
  powershell.exe -Command "Compress-Archive -Path 'nodejs' -DestinationPath '$(cygpath -w "$LAYER_DIR/shared-layer.zip")' -Force"
fi

LAYER_SIZE=$(du -sh "$LAYER_DIR/shared-layer.zip" | cut -f1)
echo "==> Layer built: layers/shared/shared-layer.zip ($LAYER_SIZE)"

echo "==> Cleaning build directory..."
rm -rf "$BUILD_DIR"

echo "==> Done!"
