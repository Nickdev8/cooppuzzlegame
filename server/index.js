const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const SCENE_FILE = path.join(__dirname, 'scene.json');

// ─── LOBBY MANAGEMENT ─────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { sockets: Set, currentLevel, gameState, levelData, playerStates }

// Global lobby for unlimited players
let globalLobby = null;

function clearExistingLobbies() {
  lobbies.clear();
  globalLobby = null;
  console.log('Cleared existing lobbies');
}

function createGlobalLobby() {
  if (!globalLobby) {
    globalLobby = createLobbyWorld('GLOBAL');
    globalLobby.isGlobal = true;
    globalLobby.maxPlayers = Infinity; // Unlimited players
  }
  return globalLobby;
}

function getGlobalLobby() {
  return createGlobalLobby();
}

function createLobbyWorld(lobbyCode) {
  let currentLevel = 0;
  let gameState = 'playing'; // 'playing', 'levelComplete', 'transitioning', 'completed'
  let levelData = null;
  let playerStates = new Map(); // socketId -> { position, dragging, etc. }

  function loadLevel(levelIndex) {
    // Load scene data
    const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));
    const levels = sceneData.levels;
    
    if (levelIndex >= levels.length) {
      console.log('All levels completed!');
      gameState = 'completed';
      return;
    }
    
    levelData = levels[levelIndex];
    currentLevel = levelIndex;
    gameState = 'playing';
    
    console.log(`Loading level ${levelIndex + 1}: ${levelData.name}`);
  }
  
  // Load first level
  loadLevel(0);
  
  return { 
    sockets: new Set(),
    currentLevel,
    gameState,
    levelData,
    playerStates,
    loadLevel
  };
}

function getLobbyWorld(lobbyCode) {
  if (lobbyCode === 'GLOBAL') {
    return getGlobalLobby();
  }
  if (!lobbies.has(lobbyCode)) {
    lobbies.set(lobbyCode, createLobbyWorld(lobbyCode));
  }
  return lobbies.get(lobbyCode);
}

// ─── SOCKET.IO ─────────────────────────────────────────────────────────
io.on('connection', socket => {
  let lobbyCode = null;
  let lobbyWorld = null;

  socket.on('joinPhysics', ({ lobby }) => {
    lobbyCode = lobby;
    lobbyWorld = getLobbyWorld(lobbyCode);
    lobbyWorld.sockets.add(socket);
    socket.join(lobbyCode);
    socket.emit('joinedPhysics', { clientSideOwnershipEnabled: true });
    
    // Send current level info
    socket.emit('levelInfo', {
      currentLevel: lobbyWorld.currentLevel,
      levelData: lobbyWorld.levelData,
      gameState: lobbyWorld.gameState
    });
  });

  socket.on('playerUpdate', (data) => {
    if (!lobbyWorld) return;
    
    // Update player state
    lobbyWorld.playerStates.set(socket.id, data);
    
    // Broadcast to other players in the lobby
    socket.to(lobbyCode).emit('playerUpdate', {
      id: socket.id,
      ...data
    });
  });

  socket.on('objectInteraction', (data) => {
    if (!lobbyWorld) return;
    
    // Broadcast object interaction to all players in lobby
    io.to(lobbyCode).emit('objectInteraction', {
      id: socket.id,
      ...data
    });
  });

  socket.on('levelComplete', () => {
    if (!lobbyWorld) return;
    console.log(`Client ${socket.id} completed level ${lobbyWorld.currentLevel + 1}`);
    
    // Trigger level transition
    lobbyWorld.gameState = 'levelComplete';
    
    // Load next level after a delay
    setTimeout(() => {
      if (lobbyWorld.gameState === 'levelComplete') {
        lobbyWorld.gameState = 'transitioning';
        lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
        
        // Notify all clients about level change
        io.to(lobbyCode).emit('levelChanged', {
          currentLevel: lobbyWorld.currentLevel,
          levelData: lobbyWorld.levelData,
          gameState: lobbyWorld.gameState
        });
      }
    }, 2000);
  });

  socket.on('skipLevel', () => {
    if (!lobbyWorld) return;
    console.log(`Client ${socket.id} requested to skip level ${lobbyWorld.currentLevel + 1}`);
    
    // Trigger level transition immediately
    lobbyWorld.gameState = 'levelComplete';
    
    // Load next level after a short delay
    setTimeout(() => {
      if (lobbyWorld.gameState === 'levelComplete') {
        lobbyWorld.gameState = 'transitioning';
        lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
        
        // Notify all clients about level change
        io.to(lobbyCode).emit('levelChanged', {
          currentLevel: lobbyWorld.currentLevel,
          levelData: lobbyWorld.levelData,
          gameState: lobbyWorld.gameState
        });
      }
    }, 500);
  });

  socket.on('disconnect', () => {
    if (lobbyWorld) {
      // Remove player state
      lobbyWorld.playerStates.delete(socket.id);
      
      lobbyWorld.sockets.delete(socket);
      socket.to(lobbyCode).emit('playerDisconnected', { id: socket.id });
      
      if (lobbyWorld.sockets.size === 0) {
        // Clean up lobby world
        lobbies.delete(lobbyCode);
      }
    }
  });
});

// ─── HTTP ROUTES ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lobbies: lobbies.size });
});

app.get('/api/global-player-count', (req, res) => {
  const count = globalLobby ? globalLobby.sockets.size : 0;
  res.json({ count });
});

app.get('/api/levels', (req, res) => {
  try {
    const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));
    res.json({ levels: sceneData.levels });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load levels' });
  }
});

server.listen(3080, () => {
  console.log('Godot Game Server running on https://iotservice.nl:3080');
  clearExistingLobbies();
});