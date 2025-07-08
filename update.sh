#!/usr/bin/env bash
set -euo pipefail

echo "Pushing to orgin..."
~/pushwithrandomemoji.sh

echo "Pushing to remote..."
git push
echo "Resuming after 5 seconds...."
sleep 5
echo "Done\n"
echo "Deploying on remote server..."
ssh nickesselman.nl 'bash -s' <<'ENDSSH'
set -euo pipefail
cd ~/escape-room/
echo "Pulling latest code..."
git pull

echo "Running npm run deploy..."
if ! ./deploy.sh; then
  echo "deploy.sh failed!" >&2
  exit 1
fi

echo "Deployment complete!"
ENDSSH

echo "All done!"