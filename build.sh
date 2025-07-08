#!/usr/bin/env bash
set -euo pipefail

echo "Pushing to orgin..."
~/pushwithrandomemoji.sh

echo "Pushing to remote..."

ssh nick@hackclub.app 'bash -s' <<'ENDSSH'

echo "Connected to remote server. Deploying..."
cd ~/mango
git pull origin main
systemctl --user restart mango.service

ENDSSH