#!/usr/bin/env bash
set -euo pipefail

echo "Pushing to orgin..."
~/pushwithrandomemoji.sh

echo "Pushing to remote..."

ssh nick@hackclub.app 'bash -s' <<'ENDSSH'

cd cooppuzzlegame/

git pull origin main

cp -R client/serverbuild/ ~/server

echo "[RUN] Starting headless server…"
  ~/server/server.x86_64 --headless --main-pack ~/server/server.pck


ENDSSH

