#!/bin/bash
set -e

echo "=== Testing Local Setup ==="

# Build the client
echo "Building client..."
cd client
npm run build
cd ..

# Check if Godot game files are in the build
echo "Checking Godot game files in build..."
if [ -f "client/build/godot-game/index.html" ]; then
    echo "✅ Godot game files found in build directory"
    ls -la client/build/godot-game/
else
    echo "❌ Godot game files not found in build directory"
    exit 1
fi

# Start a simple HTTP server to test
echo "Starting local HTTP server on port 8080..."
echo "You can now test the Godot game at: http://localhost:8080/godot-game/index.html"
echo "Press Ctrl+C to stop the server"

cd client/build
python3 -m http.server 8080 