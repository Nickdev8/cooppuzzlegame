#!/usr/bin/env bash
set -euo pipefail

echo "[RUN] Starting headless server…"
  ./client/serverbuild/server.x86_64 --headless --main-pack ./client/serverbuild/server.pck
