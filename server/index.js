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
const lobbies = new Map(); // lobbyCode -> { connections: Set, players: Map }

// Global lobby for unlimited players
let globalLobby = null;

function clearExistingLobbies() {
  lobbies.clear();
  globalLobby = null;
  console.log('Cleared existing lobbies');
}

function getLobbyWorld(lobbyCode) {
  if (lobbyCode === 'GLOBAL') {
    if (!globalLobby) {
      globalLobby = {
        connections: new Set(),
        players: new Map()
      };
    }
    return globalLobby;
  }

  if (!lobbies.has(lobbyCode)) {
    lobbies.set(lobbyCode, {
      connections: new Set(),
      players: new Map()
    });
  }
  return lobbies.get(lobbyCode);
}

// ─── WEB SOCKET SERVER ─────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let playerId = null;
  let lobbyCode = null;
  let lobbyWorld = null;

  console.log('🔌 New WebSocket connection');

  ws.on('message', (message) => {
    try {
      // Convert Buffer to string and parse JSON
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);
      
      // Handle different message types
      switch (data.type) {
        case 'mouse':
          lobbyCode = data.lobby || 'GLOBAL';
          lobbyWorld = getLobbyWorld(lobbyCode);
          playerId = data.player_id;
          
          // Add player to lobby if not already there
          if (!lobbyWorld.connections.has(ws)) {
            lobbyWorld.connections.add(ws);
            lobbyWorld.players.set(playerId, {
              x: data.x,
              y: data.y,
              lastSeen: Date.now()
            });
            
            // Send join notification to other players
            const joinMsg = JSON.stringify({
              type: 'joined',
              player_id: playerId
            });
            broadcastToLobby(lobbyWorld, joinMsg, ws);
            
            console.log(`👤 Player ${playerId} joined lobby ${lobbyCode}`);
          } else {
            // Update player position
            lobbyWorld.players.set(playerId, {
              x: data.x,
              y: data.y,
              lastSeen: Date.now()
            });
          }
          
          // Broadcast mouse position to other players in the same lobby
          const mouseMsg = JSON.stringify({
            type: 'mouse',
            player_id: playerId,
            x: data.x,
            y: data.y
          });
          broadcastToLobby(lobbyWorld, mouseMsg, ws);
          break;
          
        default:
          console.log('❓ Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (lobbyWorld && playerId) {
      lobbyWorld.connections.delete(ws);
      lobbyWorld.players.delete(playerId);
      
      // Send leave notification to other players
      const leaveMsg = JSON.stringify({
        type: 'left',
        player_id: playerId
      });
      broadcastToLobby(lobbyWorld, leaveMsg);
      
      console.log(`👋 Player ${playerId} left lobby ${lobbyCode}`);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

function broadcastToLobby(lobbyWorld, message, excludeWs = null) {
  for (const connection of lobbyWorld.connections) {
    if (connection !== excludeWs && connection.readyState === WebSocket.OPEN) {
      connection.send(message);
    }
  }
}

// ─── HTTP ROUTES ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/scene', (req, res) => {
  try {
    const sceneData = fs.readFileSync(SCENE_FILE, 'utf8');
    res.json(JSON.parse(sceneData));
  } catch (error) {
    console.error('Error reading scene file:', error);
    res.status(500).json({ error: 'Failed to read scene data' });
  }
});

// ─── SERVER STARTUP ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3080;

server.listen(PORT, () => {
  console.log(`🚀 Simple WebSocket server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🎮 Scene data: http://localhost:${PORT}/scene`);
  
  // Clear existing lobbies on startup
  clearExistingLobbies();
});

// ─── CLEANUP ──────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  wss.close();
  server.close();
  process.exit(0);
});