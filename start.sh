#!/bin/bash
set -e

echo "Starting Svelte client..."
cd client
npm run dev -- --port 80 --host 0.0.0.0 &

CLIENT_PID=$!

echo "Starting Node.js server..."
cd ../server
node index.js

kill $CLIENT_PID
