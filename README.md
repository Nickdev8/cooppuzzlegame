# Cooperative Puzzle Game

A real-time multiplayer physics-based puzzle game built with Godot (client) and Node.js (server), featuring a lobby system for organizing multiplayer sessions.

## Architecture

- **Lobby System**: Svelte-based web interface for creating and joining game sessions
- **Client**: Godot 4.4+ game engine with built-in physics
- **Server**: Node.js with Socket.IO for real-time communication
- **Networking**: WebSocket-based multiplayer synchronization

## Features

- **Lobby System**: Create and join game sessions with up to 4 players
- **Real-time multiplayer**: WebSocket-based communication
- **Physics-based gameplay**: Godot's built-in 2D physics engine
- **Drag and drop**: Click and drag objects to solve puzzles
- **Level progression**: Automatic level loading from server
- **Cross-platform**: Godot supports Windows, macOS, Linux, and Web

## Quick Start

### Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Godot 4.4+** - [Download here](https://godotengine.org/)

### Server Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3080`

### Client Setup

1. Install client dependencies:
   ```bash
   cd client
   npm install
   ```

2. Build the Godot game (optional - for development):
   ```bash
   ./build-godot-game.sh
   ```

3. Start the client:
   ```bash
   npm run dev
   ```

The lobby will be available at `http://localhost:5173`

### Playing the Game

1. **Access the Lobby**: Open `http://localhost:5173` in your browser
2. **Create or Join a Lobby**: 
   - Create a new lobby with a custom name
   - Join an existing public lobby
   - Use a private lobby code to join friends
3. **Start the Game**: Once in a lobby, the host can start the game
4. **Play**: The game will automatically load in Godot with your lobby information

## Project Structure

```
├── server/                    # Node.js server
│   ├── index.js              # Main game server logic
│   ├── lobby.js              # Lobby management server
│   ├── scene.json            # Level definitions
│   ├── package.json          # Server dependencies
│   └── package-lock.json     # Locked dependencies
├── client/                    # Svelte client + Godot game
│   ├── src/                  # Svelte lobby application
│   │   ├── routes/           # Svelte routes
│   │   │   ├── +page.svelte  # Main lobby page
│   │   │   └── game/         # Game launcher
│   │   └── lib/              # Svelte components
│   ├── GameGodotProject/     # Godot game project
│   │   └── new-game-project/
│   │       ├── scripts/      # GDScript files
│   │       ├── assets/       # Game textures
│   │       ├── main.tscn     # Main scene
│   │       └── project.godot # Godot project file
│   ├── static/               # Static assets
│   │   └── godot-game/       # Godot HTML5 export
│   └── package.json          # Client dependencies
├── build-godot-game.sh       # Godot build script
└── README.md                 # This file
```

## Development

### Lobby System

The lobby system is built with Svelte and provides:
- **Lobby Creation**: Create public or private lobbies
- **Player Management**: Host controls, player limits
- **Game Launching**: Seamless transition to Godot game
- **Real-time Updates**: Live player count and status

### Godot Integration

The Godot game integrates with the lobby system through:
- **WebSocket Communication**: Direct connection to game server
- **Lobby Information**: Receives lobby code and server URL
- **Automatic Connection**: No manual setup required
- **Multiplayer Sync**: Real-time object and player synchronization

### Adding New Levels

Levels are defined in `server/scene.json`. Each level contains:
- Ball start location
- Goal location
- Static objects (walls, platforms)
- Grabbable objects (boxes, tools)

### Building the Godot Game

To build the Godot game for web deployment:

```bash
# Make sure Godot is installed and in PATH
./build-godot-game.sh
```

This will export the Godot project to `client/static/godot-game/` for web deployment.

### Customizing the Game

- **Server**: Modify `server/index.js` for game logic changes
- **Lobby**: Edit Svelte files in `client/src/`
- **Godot Game**: Edit GDScript files in `client/GameGodotProject/new-game-project/scripts/`
- **Assets**: Add textures to `client/GameGodotProject/new-game-project/assets/`

## Networking Protocol

### Lobby System (Port 3081)
- `createLobby`: Create a new game lobby
- `joinLobby`: Join an existing lobby
- `startGame`: Launch the game for all lobby members
- `transferHost`: Transfer host privileges

### Game Server (Port 3080)
- `joinPhysics`: Join the physics game session
- `playerUpdate`: Send player state updates
- `objectInteraction`: Send object manipulation events
- `levelComplete`: Notify level completion
- `skipLevel`: Request level skip

## Deployment

### Server Deployment

1. Set up a Node.js server (VPS, cloud platform, etc.)
2. Upload server files
3. Install dependencies: `npm install`
4. Start the server: `npm start`
5. Configure firewall to allow ports 3080 and 3081

### Client Distribution

1. Build the Godot game: `./build-godot-game.sh`
2. Deploy the `client/` directory to a web server
3. Update server URLs in the client code if needed

## Troubleshooting

### Connection Issues
- Verify both servers are running (ports 3080 and 3081)
- Check firewall settings
- Ensure WebSocket URL format is correct

### Godot Build Issues
- Ensure Godot 4.4+ is installed and in PATH
- Check that the project.godot file exists
- Verify all assets are properly imported

### Physics Problems
- Check collision shapes in Godot
- Verify object mass and friction settings
- Ensure proper layer/mask configuration

### Performance Issues
- Reduce number of physics objects
- Optimize texture sizes
- Check for memory leaks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (lobby + game)
5. Submit a pull request

## License

This project is open source. See LICENSE file for details. 