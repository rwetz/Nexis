#!/usr/bin/env bash
# ╔══════════════════════════════════════╗
# ║  Ryan Wetzstein                      ║
# ║  Nexis                               ║
# ║  2026                                ║
# ╚══════════════════════════════════════╝
#
# Nexis production build — Linux counterpart to build.ps1.
# Usage:  ./build.sh
# Output: src-tauri/target/release/bundle/{appimage,deb,rpm}/
#
# Requires the WebKitGTK/AppIndicator/rsvg dev stack; see the build-linux job
# in .github/workflows/release.yml for the exact package list.

set -euo pipefail
cd "$(dirname "$0")"

# beforeBuildCommand is cleared because we run the frontend build ourselves.
override='{"build":{"beforeBuildCommand":""}}'

echo "Building frontend..."
pnpm build

echo "Building Tauri bundle..."
pnpm tauri build --config "$override"

echo "Done!"
ls -lh src-tauri/target/release/bundle/appimage/*.AppImage \
       src-tauri/target/release/bundle/deb/*.deb \
       src-tauri/target/release/bundle/rpm/*.rpm 2>/dev/null || true
