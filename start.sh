#!/usr/bin/env bash
set -euo pipefail

echo "[RUN] Starting headless server…"
  ./build/server/server.x86_64 --headless --main-pack ./build/server/server.pck