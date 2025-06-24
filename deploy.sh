#!/bin/bash
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

set -euo pipefail

# Make sure this script is executable: chmod +x deploy.sh

# Logging function
echo_info() { echo -e "\033[1;34m[INFO]\033[0m $1"; }
echo_error() { echo -e "\033[1;31m[ERROR]\033[0m $1"; }

# Check for required commands
for cmd in npm pm2 sudo nginx; do
  if ! command -v $cmd &>/dev/null; then
    echo_error "$cmd is not installed or not in PATH. Aborting."; exit 1
  fi
done

# Check for passwordless sudo
if ! sudo -n true 2>/dev/null; then
  echo_error "Passwordless sudo is required for deployment. Aborting."; exit 1
fi

# Fix permissions for build
sudo chown -R $(whoami):$(whoami) /home/pi/escape-room/client

# Build client
echo_info "Building client..."
cd /home/pi/escape-room/client
rm -rf /home/pi/escape-room/client/.svelte-kit
rm -rf /home/pi/escape-room/client/build
npm ci
npm run build

echo_info "Deploying client to /var/www/escape-room-client..."
sudo rm -rf /var/www/escape-room-client/*
sudo cp -r build/* /var/www/escape-room-client/
sudo chown -R www-data:www-data /var/www/escape-room-client

# Fix permissions for server build
sudo chown -R $(whoami):$(whoami) /home/pi/escape-room/server

# Build and deploy server
echo_info "Building and deploying server..."
cd /home/pi/escape-room/server
npm ci
pm2 delete escape-room-server
pm2 delete escape-room-lobby
pm2 start index.js --name escape-room-server --cwd /home/pi/escape-room/server --update-env
pm2 start lobby.js --name escape-room-lobby --cwd /home/pi/escape-room/server --update-env
pm2 flush

# Reload nginx
echo_info "Testing and reloading nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo_info "Deployment complete!"
