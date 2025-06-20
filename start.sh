#!/bin/bash

# Ensure the script exits on error
set -e

# Start Svelte (client) in the background
echo "Starting Svelte client..."
cd client
npm run dev &

# Store client PID to kill later if needed
CLIENT_PID=$!

# Start Node.js (server)
echo "Starting Node.js server..."
cd ../server
node index.js

# If Node server exits, kill client too
kill $CLIENT_PID
