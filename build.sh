#!/usr/bin/env bash
set -euo pipefail

echo "#### Pushing to orgin ############"
~/pushwithrandomemoji.sh

echo "#### Pushing to remote ###########"
git push

ssh nick@hackclub.app 'bash -s' <<'ENDSSH'

echo "#### Connected ###################"
cd ~/mango

sleep 1
echo "#### Pulling from Origin #########"
git pull origin main
cp -a ~/mango/build/client/. ~/pub/

echo "#### Restarting mango.service ####"
systemctl --user restart mango.service

ENDSSH

echo ""
echo ""
echo "Done."
echo ""
