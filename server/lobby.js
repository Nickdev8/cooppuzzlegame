const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── LOBBY MANAGEMENT ─────────────────────────────────────────────────────
class Lobby {
  constructor(code, hostId, hostName = 'Host') {
    this.code = code;
    this.hostId = hostId;
    this.players = [{ id: hostId, name: hostName, isHost: true }];
    this.maxPlayers = 4;
    this.createdAt = Date.now();
    this.isPrivate = false;
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= this.maxPlayers) {
      return false;
    }
    
    const existingPlayer = this.players.find(p => p.id === playerId);
    if (existingPlayer) {
      return true; // Player already in lobby
    }
    
    this.players.push({ id: playerId, name: playerName, isHost: false });
    return true;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      const wasHost = this.players[index].isHost;
      this.players.splice(index, 1);
      
      // If host left, assign new host
      if (wasHost && this.players.length > 0) {
        this.players[0].isHost = true;
        this.hostId = this.players[0].id;
      }
      
      return true;
    }
    return false;
  }

  getPublicInfo() {
    return {
      code: this.code,
      playerCount: this.players.length,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt
    };
  }

  getFullInfo() {
    return {
      code: this.code,
      players: this.players,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
      isPrivate: this.isPrivate
    };
  }
}

// Store lobbies
const lobbies = new Map(); // code -> Lobby
const playerLobbies = new Map(); // playerId -> lobbyCode
const publicLobbies = new Map(); // code -> Lobby (only public ones)

function generateLobbyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function createLobby(hostId, hostName, isPrivate = false) {
  let code;
  do {
    code = generateLobbyCode();
  } while (lobbies.has(code));

  const lobby = new Lobby(code, hostId, hostName);
  lobby.isPrivate = isPrivate;
  
  lobbies.set(code, lobby);
  playerLobbies.set(hostId, code);
  
  if (!isPrivate) {
    publicLobbies.set(code, lobby);
  }
  
  return lobby;
}

function joinLobby(code, playerId, playerName) {
  const lobby = lobbies.get(code);
  if (!lobby) {
    return { success: false, error: 'Lobby not found' };
  }
  
  if (lobby.players.length >= lobby.maxPlayers) {
    return { success: false, error: 'Lobby is full' };
  }
  
  const success = lobby.addPlayer(playerId, playerName);
  if (success) {
    playerLobbies.set(playerId, code);
    return { success: true, lobby: lobby.getFullInfo() };
  } else {
    return { success: false, error: 'Failed to join lobby' };
  }
}

function leaveLobby(playerId) {
  const lobbyCode = playerLobbies.get(playerId);
  if (!lobbyCode) {
    return;
  }
  
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) {
    return;
  }
  
  lobby.removePlayer(playerId);
  playerLobbies.delete(playerId);
  
  // If lobby is empty, delete it
  if (lobby.players.length === 0) {
    lobbies.delete(lobbyCode);
    publicLobbies.delete(lobbyCode);
  } else {
    // If lobby still exists but is now private, remove from public lobbies
    if (lobby.isPrivate && publicLobbies.has(lobbyCode)) {
      publicLobbies.delete(lobbyCode);
    }
  }
  
  return lobbyCode;
}

// ─── SOCKET.IO HANDLERS ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current public lobbies
  socket.emit('publicLobbies', Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo()));
  
  socket.on('createLobby', ({ playerName, isPrivate = false }) => {
    console.log('Creating lobby for:', socket.id, playerName);
    const lobby = createLobby(socket.id, playerName, isPrivate);
    socket.emit('lobbyCreated', lobby.getFullInfo());
    socket.join(lobby.code);
    
    // Update public lobbies for all clients
    io.emit('publicLobbies', Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo()));
  });
  
  socket.on('joinLobby', ({ code, playerName }) => {
    console.log('Joining lobby:', code, 'by:', socket.id, playerName);
    const result = joinLobby(code, socket.id, playerName);
    
    if (result.success) {
      socket.emit('lobbyJoined', result.lobby);
      socket.join(code);
      
      // Notify other players in the lobby
      socket.to(code).emit('playerJoined', { 
        id: socket.id, 
        name: playerName,
        playerCount: result.lobby.players.length 
      });
      
      // Update public lobbies
      io.emit('publicLobbies', Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo()));
    } else {
      socket.emit('joinError', result.error);
    }
  });
  
  socket.on('refreshPublicLobbies', () => {
    socket.emit('publicLobbies', Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo()));
  });
  
  socket.on('startGame', () => {
    const lobbyCode = playerLobbies.get(socket.id);
    if (!lobbyCode) {
      socket.emit('error', 'Not in a lobby');
      return;
    }
    
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error', 'Only the host can start the game');
      return;
    }
    
    if (lobby.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }
    
    // Notify all players in the lobby to start the game
    io.to(lobbyCode).emit('gameStarting', {
      lobbyCode: lobbyCode,
      players: lobby.players
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const lobbyCode = leaveLobby(socket.id);
    
    if (lobbyCode) {
      const lobby = lobbies.get(lobbyCode);
      if (lobby) {
        // Notify remaining players
        socket.to(lobbyCode).emit('playerLeft', { 
          id: socket.id,
          playerCount: lobby.players.length,
          newHost: lobby.players.find(p => p.isHost)?.id
        });
        
        // Update public lobbies
        io.emit('publicLobbies', Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo()));
      }
    }
  });
});

// ─── HTTP ROUTES ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lobbies: lobbies.size, publicLobbies: publicLobbies.size });
});

app.get('/lobbies/public', (req, res) => {
  const publicLobbyList = Array.from(publicLobbies.values()).map(lobby => lobby.getPublicInfo());
  res.json(publicLobbyList);
});

// ─── START SERVER ────────────────────────────────────────────────────────
const PORT = process.env.LOBBY_PORT || 3081;
server.listen(PORT, () => {
  console.log(`Lobby server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Public lobbies: http://localhost:${PORT}/lobbies/public`);
}); 