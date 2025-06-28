const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const app = express();
app.use(cors());
const server = http.createServer(app);

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const SCENE_FILE = path.join(__dirname, 'scene.json');

// ─── LOBBY MANAGEMENT ─────────────────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { connections: Set, currentLevel, gameState, levelData, playerStates }

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
  let playerStates = new Map(); // connectionId -> { position, dragging, etc. }

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
    connections: new Set(),
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

// ─── WEBSOCKET SERVER ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let lobbyCode = null;
  let lobbyWorld = null;
  let playerId = null;

  ws.on('message', (message) => {
    try {
      // Convert Buffer to string and parse JSON
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);
      
      // Handle different message types
      switch (data.type) {
        case 'joinPhysics':
          lobbyCode = data.lobby;
          lobbyWorld = getLobbyWorld(lobbyCode);
          lobbyWorld.connections.add(ws);
          playerId = ws._socket.remoteAddress + ':' + Date.now(); // Simple ID generation
          ws.playerId = playerId;
          
          // Send join confirmation
          ws.send(JSON.stringify({
            type: 'joinedPhysics',
            data: { clientSideOwnershipEnabled: true }
          }));
          
          // Send current level info
          ws.send(JSON.stringify({
            type: 'levelInfo',
            data: {
              currentLevel: lobbyWorld.currentLevel,
              levelData: lobbyWorld.levelData,
              gameState: lobbyWorld.gameState
            }
          }));
          
          console.log(`Player ${playerId} joined lobby ${lobbyCode}`);
          break;
          
        case 'playerUpdate':
          if (!lobbyWorld) return;
          
          // Update player state
          lobbyWorld.playerStates.set(playerId, data.data);
          
          // Broadcast to other players in the lobby
          const playerUpdateMessage = JSON.stringify({
            type: 'playerUpdate',
            data: {
              id: playerId,
              ...data.data
            }
          });
          
          lobbyWorld.connections.forEach(connection => {
            if (connection !== ws && connection.readyState === WebSocket.OPEN) {
              connection.send(playerUpdateMessage);
            }
          });
          break;
          
        case 'objectInteraction':
          if (!lobbyWorld) return;
          
          // Broadcast object interaction to all players in lobby
          const interactionMessage = JSON.stringify({
            type: 'objectInteraction',
            data: {
              id: playerId,
              ...data.data
            }
          });
          
          lobbyWorld.connections.forEach(connection => {
            if (connection.readyState === WebSocket.OPEN) {
              connection.send(interactionMessage);
            }
          });
          break;
          
        case 'levelComplete':
          if (!lobbyWorld) return;
          console.log(`Client ${playerId} completed level ${lobbyWorld.currentLevel + 1}`);
          
          // Trigger level transition
          lobbyWorld.gameState = 'levelComplete';
          
          // Load next level after a delay
          setTimeout(() => {
            if (lobbyWorld.gameState === 'levelComplete') {
              lobbyWorld.gameState = 'transitioning';
              lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
              
              // Notify all clients about level change
              const levelChangedMessage = JSON.stringify({
                type: 'levelChanged',
                data: {
                  currentLevel: lobbyWorld.currentLevel,
                  levelData: lobbyWorld.levelData,
                  gameState: lobbyWorld.gameState
                }
              });
              
              lobbyWorld.connections.forEach(connection => {
                if (connection.readyState === WebSocket.OPEN) {
                  connection.send(levelChangedMessage);
                }
              });
            }
          }, 2000);
          break;
          
        case 'skipLevel':
          if (!lobbyWorld) return;
          console.log(`Client ${playerId} requested to skip level ${lobbyWorld.currentLevel + 1}`);
          
          // Trigger level transition immediately
          lobbyWorld.gameState = 'levelComplete';
          
          // Load next level after a short delay
          setTimeout(() => {
            if (lobbyWorld.gameState === 'levelComplete') {
              lobbyWorld.gameState = 'transitioning';
              lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
              
              // Notify all clients about level change
              const levelChangedMessage = JSON.stringify({
                type: 'levelChanged',
                data: {
                  currentLevel: lobbyWorld.currentLevel,
                  levelData: lobbyWorld.levelData,
                  gameState: lobbyWorld.gameState
                }
              });
              
              lobbyWorld.connections.forEach(connection => {
                if (connection.readyState === WebSocket.OPEN) {
                  connection.send(levelChangedMessage);
                }
              });
            }
          }, 500);
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', (code, reason) => {
    if (lobbyWorld) {
      // Remove player state
      lobbyWorld.playerStates.delete(playerId);
      
      lobbyWorld.connections.delete(ws);
      
      // Notify other players about disconnection
      const disconnectMessage = JSON.stringify({
        type: 'playerDisconnected',
        data: { id: playerId }
      });
      
      lobbyWorld.connections.forEach(connection => {
        if (connection.readyState === WebSocket.OPEN) {
          connection.send(disconnectMessage);
        }
      });
      
      console.log(`Player ${playerId} disconnected from lobby ${lobbyCode}`);
      
      if (lobbyWorld.connections.size === 0) {
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
  const count = globalLobby ? globalLobby.connections.size : 0;
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