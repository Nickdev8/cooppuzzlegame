#!/bin/bash

# Enhanced deploy script for Coop Puzzle Game
set -e  # Exit on any error

echo "🚀 Starting deployment..."

# Build client
echo "📦 Building client..."
npm run build-client

# Deploy client
echo "📤 Deploying client..."
npm run deploy-client

# Deploy servers
echo "🖥️  Deploying servers..."
npm run deploy-server

# Reload nginx
echo "🔄 Reloading nginx..."
npm run reload-nginx

# Check server status
echo "✅ Checking server status..."
pm2 list

echo "🎉 Deployment complete!" 