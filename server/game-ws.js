const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const SCENE_FILE = path.join(__dirname, 'scene.json');
const PORT = process.env.GAME_WS_PORT || 9001;

// ─── GAME STATE MANAGEMENT ────────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { players: Map, currentLevel, gameState, levelData }

function createLobbyWorld(lobbyCode) {
  let currentLevel = 0;
  let gameState = 'playing'; // 'playing', 'levelComplete', 'transitioning', 'completed'
  let levelData = null;
  let players = new Map(); // playerId -> { position, dragging, etc. }

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
    players,
    currentLevel,
    gameState,
    levelData,
    loadLevel
  };
}

function getLobbyWorld(lobbyCode) {
  if (!lobbies.has(lobbyCode)) {
    lobbies.set(lobbyCode, createLobbyWorld(lobbyCode));
  }
  return lobbies.get(lobbyCode);
}

// ─── WEBSOCKET SERVER ─────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: PORT });

console.log(`Game WebSocket server running on ws://127.0.0.1:${PORT}`);

wss.on('connection', ws => {
  let playerId = null;
  let lobbyCode = null;
  let lobbyWorld = null;

  ws.on('message', message => {
    try {
      let data = JSON.parse(message);
      
      // Handle different message types
      if (data.type === 'join') {
        // Player joining a lobby
        playerId = data.playerId;
        lobbyCode = data.lobbyCode;
        lobbyWorld = getLobbyWorld(lobbyCode);
        
        console.log(`Player ${playerId} joined lobby ${lobbyCode}`);
        
        // Send current level info
        ws.send(JSON.stringify({
          type: 'levelInfo',
          currentLevel: lobbyWorld.currentLevel,
          levelData: lobbyWorld.levelData,
          gameState: lobbyWorld.gameState
        }));
        
        // Send current game state to new player
        const gameState = Array.from(lobbyWorld.players.values());
        ws.send(JSON.stringify({
          type: 'gameState',
          players: gameState
        }));
        
      } else if (data.type === 'playerUpdate') {
        // Player position/state update
        if (!lobbyWorld || !playerId) return;
        
        // Update player state
        lobbyWorld.players.set(playerId, data.playerData);
        
        // Broadcast to other players in the lobby
        const updateMessage = JSON.stringify({
          type: 'playerUpdate',
          playerId: playerId,
          playerData: data.playerData
        });
        
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === 1) { // WebSocket.OPEN = 1
            client.send(updateMessage);
          }
        });
        
      } else if (data.type === 'objectInteraction') {
        // Object interaction (like dragging)
        if (!lobbyWorld || !playerId) return;
        
        // Broadcast object interaction to all players in lobby
        const interactionMessage = JSON.stringify({
          type: 'objectInteraction',
          playerId: playerId,
          interactionData: data.interactionData
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN = 1
            client.send(interactionMessage);
          }
        });
        
      } else if (data.type === 'levelComplete') {
        // Level completed
        if (!lobbyWorld) return;
        console.log(`Player ${playerId} completed level ${lobbyWorld.currentLevel + 1}`);
        
        // Trigger level transition
        lobbyWorld.gameState = 'levelComplete';
        
        // Load next level after a delay
        setTimeout(() => {
          if (lobbyWorld.gameState === 'levelComplete') {
            lobbyWorld.gameState = 'transitioning';
            lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
            
            // Notify all clients about level change
            const levelChangeMessage = JSON.stringify({
              type: 'levelChanged',
              currentLevel: lobbyWorld.currentLevel,
              levelData: lobbyWorld.levelData,
              gameState: lobbyWorld.gameState
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === 1) { // WebSocket.OPEN = 1
                client.send(levelChangeMessage);
              }
            });
          }
        }, 2000);
        
      } else if (data.type === 'skipLevel') {
        // Skip level
        if (!lobbyWorld) return;
        console.log(`Player ${playerId} requested to skip level ${lobbyWorld.currentLevel + 1}`);
        
        // Trigger level transition immediately
        lobbyWorld.gameState = 'levelComplete';
        
        // Load next level after a short delay
        setTimeout(() => {
          if (lobbyWorld.gameState === 'levelComplete') {
            lobbyWorld.gameState = 'transitioning';
            lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
            
            // Notify all clients about level change
            const levelChangeMessage = JSON.stringify({
              type: 'levelChanged',
              currentLevel: lobbyWorld.currentLevel,
              levelData: lobbyWorld.levelData,
              gameState: lobbyWorld.gameState
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === 1) { // WebSocket.OPEN = 1
                client.send(levelChangeMessage);
              }
            });
          }
        }, 500);
      }
      
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', (code, reason) => {
    if (lobbyWorld && playerId) {
      // Remove player state
      lobbyWorld.players.delete(playerId);
      console.log(`Player ${playerId} disconnected from lobby ${lobbyCode}`);
      
      // Notify other players
      const disconnectMessage = JSON.stringify({
        type: 'playerDisconnected',
        playerId: playerId
      });
      
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) { // WebSocket.OPEN = 1
          client.send(disconnectMessage);
        }
      });
      
      // Clean up lobby if empty
      if (lobbyWorld.players.size === 0) {
        lobbies.delete(lobbyCode);
        console.log(`Lobby ${lobbyCode} cleaned up (no players left)`);
      }
    }
  });
});

// ─── HTTP ENDPOINTS FOR LOBBY INTEGRATION ─────────────────────────────────
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    lobbies: lobbies.size,
    totalPlayers: Array.from(lobbies.values()).reduce((sum, lobby) => sum + lobby.players.size, 0)
  });
});

app.get('/api/lobbies/:lobbyCode/players', (req, res) => {
  const lobbyCode = req.params.lobbyCode;
  const lobby = lobbies.get(lobbyCode);
  
  if (lobby) {
    res.json({ 
      playerCount: lobby.players.size,
      currentLevel: lobby.currentLevel,
      gameState: lobby.gameState
    });
  } else {
    res.status(404).json({ error: 'Lobby not found' });
  }
});

// Start HTTP server on a different port
const HTTP_PORT = process.env.GAME_HTTP_PORT || 9002;
app.listen(HTTP_PORT, () => {
  console.log(`Game HTTP server running on port ${HTTP_PORT}`);
  console.log(`Health check: http://localhost:${HTTP_PORT}/health`);
}); 