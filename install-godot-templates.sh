#!/bin/bash

# Install Godot HTML5 Export Templates
echo "🔧 Installing Godot HTML5 Export Templates..."

GODOT_VERSION="4.4.1"
TEMPLATES_DIR="$HOME/.local/share/godot/export_templates/$GODOT_VERSION.stable"
WEB_TEMPLATES_URL="https://github.com/godotengine/godot/releases/download/$GODOT_VERSION-stable/Godot_v${GODOT_VERSION}-stable_export_templates.tpz"

# Create templates directory
mkdir -p "$TEMPLATES_DIR"

echo "📁 Templates directory: $TEMPLATES_DIR"
echo "🌐 Downloading templates from: $WEB_TEMPLATES_URL"

# Download export templates
if command -v curl &> /dev/null; then
    curl -L -o "/tmp/godot_templates.tpz" "$WEB_TEMPLATES_URL"
elif command -v wget &> /dev/null; then
    wget -O "/tmp/godot_templates.tpz" "$WEB_TEMPLATES_URL"
else
    echo "❌ Error: Neither curl nor wget is installed"
    exit 1
fi

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to download export templates"
    exit 1
fi

# Extract templates
echo "📦 Extracting templates..."
cd "$TEMPLATES_DIR"
unzip -o "/tmp/godot_templates.tpz"

if [ $? -eq 0 ]; then
    echo "✅ Successfully installed Godot HTML5 export templates!"
    echo "📁 Templates installed in: $TEMPLATES_DIR"
    ls -la "$TEMPLATES_DIR"
else
    echo "❌ Error: Failed to extract templates"
    exit 1
fi

# Clean up
rm -f "/tmp/godot_templates.tpz"

echo ""
echo "🎯 Now you can run: ./build-godot-game.sh" 