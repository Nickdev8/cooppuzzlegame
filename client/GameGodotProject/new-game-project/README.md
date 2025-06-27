# Cooperative Puzzle Game - Godot Client

This is the Godot client for the cooperative puzzle game. It connects to a Node.js server to enable multiplayer puzzle solving.

## Features

- Real-time multiplayer physics-based puzzle solving
- Drag and drop object manipulation
- Level progression system
- WebSocket-based networking
- Built-in physics engine for smooth gameplay

## Setup

### Prerequisites

1. **Godot 4.4+** - Download from [godotengine.org](https://godotengine.org/)
2. **Node.js Server** - The server must be running (see server README)

### Installation

1. Open Godot Engine
2. Click "Import" and select this project folder
3. Wait for the project to import
4. Click "Run" or press F5 to start the game

## How to Play

1. **Connect to Server**: Enter the server URL (default: `ws://localhost:3080`) and click "Connect to Global Lobby"
2. **Gameplay**: 
   - Click and drag objects to move them
   - Work with other players to solve puzzles
   - Guide the ball to the goal to complete levels
   - Use the "Skip Level" button if needed

## Controls

- **Left Mouse Button**: Click and drag objects
- **Mouse Movement**: Move objects around the level

## Project Structure

```
scripts/
├── GameManager.gd      # Main game logic and level management
├── NetworkManager.gd   # WebSocket communication with server
assets/
├── ball.png           # Ball texture
├── box.png            # Box texture
└── cursor.svg         # Cursor texture
```

## Networking

The game uses WebSocket connections to communicate with the server:

- **Connection**: Automatically connects to the specified server
- **Level Sync**: Receives level data and game state from server
- **Object Interactions**: Sends and receives object manipulation events
- **Player Updates**: Broadcasts player actions to other clients

## Development

### Adding New Levels

Levels are defined in the server's `scene.json` file. The Godot client will automatically load and display these levels.

### Customizing Objects

To add new object types:

1. Add textures to the `assets/` folder
2. Update the `GameManager.gd` script to handle new object types
3. Modify the `_create_static_object()` and `_create_grabbable_object()` functions

### Physics Settings

The game uses Godot's built-in 2D physics engine. You can adjust physics properties in the `GameManager.gd` script:

- Gravity settings
- Object mass and friction
- Collision detection

## Troubleshooting

### Connection Issues

- Ensure the server is running on the correct port
- Check firewall settings
- Verify the WebSocket URL format

### Physics Problems

- Check that objects have proper collision shapes
- Verify mass and friction settings
- Ensure proper layer/mask settings for collisions

### Performance Issues

- Reduce the number of physics objects
- Optimize texture sizes
- Check for memory leaks in object creation/destruction

## Building for Distribution

1. In Godot, go to Project → Export
2. Choose your target platform (Windows, macOS, Linux, Web)
3. Configure export settings
4. Build the project

## License

This project is part of the cooperative puzzle game system. 