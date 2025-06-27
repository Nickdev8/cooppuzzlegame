#!/bin/bash

# Build script for Godot Cooperative Puzzle Game
# This script helps export the Godot project to HTML5 format

echo "🎮 Building Godot Cooperative Puzzle Game..."

# Check if Godot is installed
if ! command -v godot &> /dev/null; then
    echo "❌ Error: Godot is not installed or not in PATH"
    echo "Please install Godot 4.4+ from https://godotengine.org/"
    exit 1
fi

# Check if the Godot project exists
GODOT_PROJECT_DIR="client/GameGodotProject/new-game-project"
if [ ! -f "$GODOT_PROJECT_DIR/project.godot" ]; then
    echo "❌ Error: Godot project not found at $GODOT_PROJECT_DIR"
    exit 1
fi

# Create output directory
OUTPUT_DIR="client/static/godot-game"
mkdir -p "$OUTPUT_DIR"

echo "📁 Project directory: $GODOT_PROJECT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"

# Export to HTML5
echo "🚀 Exporting to HTML5..."
cd "$GODOT_PROJECT_DIR"

# Create export preset if it doesn't exist
if [ ! -f "export_presets.cfg" ]; then
    echo "📝 Creating export preset..."
    cat > export_presets.cfg << EOF
[preset.0]

name="HTML5"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="../../static/godot-game/index.html"
encryption_include_filters=""
encryption_exclude_filters=""
encryption_pck=false
encryption_directory=""
minify_html=false
html_export_icon=""
html_custom_html_shell=""
html_head_include=""
html_footer_include=""
html_export_icon=""
EOF
fi

# Export the project
echo "🔨 Building HTML5 export..."
godot --headless --export "HTML5" "../../static/godot-game/index.html"

if [ $? -eq 0 ]; then
    echo "✅ Successfully exported Godot game to HTML5!"
    echo "📁 Game files are now in: $OUTPUT_DIR"
    echo ""
    echo "🎯 Next steps:"
    echo "1. Start the server: cd server && npm start"
    echo "2. Start the client: cd client && npm run dev"
    echo "3. Open the lobby at: http://localhost:5173"
    echo "4. Create or join a lobby and start the game"
else
    echo "❌ Error: Failed to export Godot game"
    exit 1
fi 