const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const Matter = require('matter-js');

const { Engine, World, Bodies, Body, Constraint } = Matter;

// ─── CONFIGURATION ──────────────────────────────────────────────────────
const CONFIG = {
  PORT: process.env.GAME_PORT || 3080,
  WALL_THICKNESS: 10,
  RESPAWN_MARGIN: 50,
  CANVAS_SIZE: { width: 1920, height: 1080 },
  PHYSICS: {
    FPS: 60,
    UPDATE_INTERVAL: 1000 / 60,
    STATE_UPDATE_INTERVAL: 1000 / 30 // Send state updates at 30 FPS to reduce socket traffic
  },
  SCENE_FILE: path.join(__dirname, 'scene.json')
};

// Load scene configuration
const sceneData = JSON.parse(fs.readFileSync(CONFIG.SCENE_FILE, 'utf-8'));

// ─── GAME ROOM CLASS ───────────────────────────────────────────────────
class GameRoom {
  constructor(lobbyCode) {
    this.lobbyCode = lobbyCode;
    this.players = new Map(); // socketId -> playerInfo
    this.engine = Engine.create();
    this.world = this.engine.world;
    this.bodies = new Map(); // bodyId -> { body, renderHint }
    this.dynamicBodies = [];
    this.anchoredBodies = [];
    this.dragConstraints = new Map(); // socketId -> constraint
    this.lastStateUpdate = 0;
    this.stateUpdateInterval = CONFIG.PHYSICS.STATE_UPDATE_INTERVAL;
    
    console.log(`[GameRoom:${lobbyCode}] Creating new game room`);
    this.setupPhysics();
    this.setupScene();
    this.startGameLoop();
  }

  setupPhysics() {
    const { width, height } = CONFIG.CANVAS_SIZE;
    const wallHeight = height * 20;
    
    // Create boundary walls
    const walls = [
      Bodies.rectangle(-CONFIG.WALL_THICKNESS / 2, height / 2, CONFIG.WALL_THICKNESS, wallHeight, { isStatic: true }),
      Bodies.rectangle(width + CONFIG.WALL_THICKNESS / 2, height / 2, CONFIG.WALL_THICKNESS, wallHeight, { isStatic: true }),
      Bodies.rectangle(width / 2, height + CONFIG.WALL_THICKNESS / 2, width + CONFIG.WALL_THICKNESS * 2, CONFIG.WALL_THICKNESS, { isStatic: true })
    ];
    
    World.add(this.world, walls);
    console.log(`[GameRoom:${this.lobbyCode}] Physics setup complete`);
  }

  setupScene() {
    console.log(`[GameRoom:${this.lobbyCode}] Setting up scene with ${sceneData.length} objects`);
    
    for (const cfg of sceneData) {
      const body = this.createBodyFromConfig(cfg);
      if (!body) continue;
      
      this.bodies.set(cfg.id, { body, renderHint: cfg });
      this.dynamicBodies.push(body);
      
      // Setup fixed-point constraints if specified
      if (Array.isArray(cfg.fixedPoints)) {
        this.setupFixedPoints(body, cfg);
      }
    }
  }

  createBodyFromConfig(cfg) {
    let baseX, baseY;
    
    // Calculate position
    if (cfg.screen) {
      baseX = CONFIG.CANVAS_SIZE.width * (cfg.screen.xPercent ?? 0) + (cfg.offset?.x || 0);
      baseY = CONFIG.CANVAS_SIZE.height * (cfg.screen.yPercent ?? 0) + (cfg.offset?.y || 0);
    } else {
      baseX = cfg.x;
      baseY = cfg.y;
    }

    const opts = {
      mass: cfg.mass ?? 1,
      restitution: cfg.restitution ?? 0.2,
      friction: cfg.friction ?? 0.1
    };

    let body;
    if (cfg.type === 'circle') {
      body = Bodies.circle(baseX, baseY, cfg.radius, opts);
    } else if (cfg.type === 'rectangle') {
      body = Bodies.rectangle(baseX, baseY, cfg.width, cfg.height, opts);
    } else {
      console.warn(`[GameRoom:${this.lobbyCode}] Unknown body type: ${cfg.type}`);
      return null;
    }

    body.label = cfg.id;
    World.add(this.world, body);
    return body;
  }

  setupFixedPoints(body, cfg) {
    const w = cfg.width ?? cfg.radius * 2;
    const h = cfg.height ?? cfg.radius * 2;
    
    for (const fp of cfg.fixedPoints) {
      const localX = fp.offsetX != null ? fp.offsetX : (fp.percentX ?? 0) * w;
      const localY = fp.offsetY != null ? fp.offsetY : (fp.percentY ?? 0) * h;
      const halfW = w / 2;
      const halfH = h / 2;
      const worldX = body.position.x + (localX - halfW);
      const worldY = body.position.y + (localY - halfH);
      
      const constraint = Constraint.create({
        pointA: { x: worldX, y: worldY },
        bodyB: body,
        pointB: { x: localX - halfW, y: localY - halfH },
        length: 0,
        stiffness: fp.stiffness ?? 1,
        damping: fp.damping ?? 0.1
      });
      
      World.add(this.world, constraint);
      this.anchoredBodies.push({ cfg, constraint, fp });
    }
  }

  startGameLoop() {
    console.log(`[GameRoom:${this.lobbyCode}] Starting game loop`);
    
    this.gameInterval = setInterval(() => {
      Engine.update(this.engine, CONFIG.PHYSICS.UPDATE_INTERVAL);
      this.handleRespawns();
      this.updateState();
    }, CONFIG.PHYSICS.UPDATE_INTERVAL);
  }

  handleRespawns() {
    const floorY = CONFIG.CANVAS_SIZE.height + CONFIG.WALL_THICKNESS / 2;
    
    for (const body of this.dynamicBodies) {
      if (body.position.y > floorY + CONFIG.RESPAWN_MARGIN) {
        console.log(`[GameRoom:${this.lobbyCode}] Respawning body ${body.label}`);
        Body.setPosition(body, { x: 300, y: 100 });
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
        Body.setAngle(body, 0);
      }
    }
  }

  updateState() {
    const now = Date.now();
    
    // Only send state updates at the specified interval to reduce socket traffic
    if (now - this.lastStateUpdate < this.stateUpdateInterval) {
      return;
    }
    
    this.lastStateUpdate = now;
    
    if (this.players.size === 0) return;
    
    const state = {
      bodies: Array.from(this.bodies.values()).map(({ body, renderHint }) => ({
        id: body.label,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        image: renderHint.image,
        width: renderHint.width,
        height: renderHint.height
      })),
      anchors: this.anchoredBodies.map(({ constraint }) => constraint.pointA)
    };
    
    // Only emit if there are players and state has changed
    if (this.players.size > 0) {
      io.to(this.lobbyCode).emit('state', state);
    }
  }

  addPlayer(socketId, playerInfo) {
    this.players.set(socketId, playerInfo);
    console.log(`[GameRoom:${this.lobbyCode}] Player ${playerInfo.name} (${socketId}) joined. Total: ${this.players.size}`);
  }

  removePlayer(socketId) {
    const playerInfo = this.players.get(socketId);
    this.players.delete(socketId);
    
    // Remove drag constraints
    this.removeDragConstraint(socketId);
    
    console.log(`[GameRoom:${this.lobbyCode}] Player ${playerInfo?.name || socketId} left. Total: ${this.players.size}`);
    
    // Cleanup if no players left
    if (this.players.size === 0) {
      this.cleanup();
    }
  }

  removeDragConstraint(socketId) {
    const constraint = this.dragConstraints.get(socketId);
    if (constraint) {
      World.remove(this.world, constraint);
      this.dragConstraints.delete(socketId);
      console.log(`[GameRoom:${this.lobbyCode}] Removed drag constraint for ${socketId}`);
    }
  }

  handleStartDrag(socketId, { id, x, y }) {
    // Remove existing drag constraint
    this.removeDragConstraint(socketId);
    
    const bodyEntry = this.bodies.get(id);
    if (!bodyEntry) return;
    
    const constraint = Constraint.create({ 
      pointA: { x, y }, 
      bodyB: bodyEntry.body, 
      pointB: { x: 0, y: 0 }, 
      stiffness: 0.1, 
      damping: 0.02 
    });
    
    World.add(this.world, constraint);
    this.dragConstraints.set(socketId, constraint);
    console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} started dragging ${id}`);
  }

  handleDrag(socketId, { x, y }) {
    const constraint = this.dragConstraints.get(socketId);
    if (constraint) {
      constraint.pointA.x = x;
      constraint.pointA.y = y;
    }
  }

  handleEndDrag(socketId) {
    this.removeDragConstraint(socketId);
    console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} ended drag`);
  }

  cleanup() {
    console.log(`[GameRoom:${this.lobbyCode}] Cleaning up game room`);
    
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
    }
    
    // Clean up all constraints
    for (const [socketId] of this.dragConstraints) {
      this.removeDragConstraint(socketId);
    }
    
    gameRooms.delete(this.lobbyCode);
  }
}

// ─── GAME ROOM MANAGEMENT ───────────────────────────────────────────────
const gameRooms = new Map(); // lobbyCode -> GameRoom

function getOrCreateGameRoom(lobbyCode) {
  let gameRoom = gameRooms.get(lobbyCode);
  if (!gameRoom) {
    gameRoom = new GameRoom(lobbyCode);
    gameRooms.set(lobbyCode, gameRoom);
  }
  return gameRoom;
}

// ─── EXPRESS & SOCKET.IO SETUP ──────────────────────────────────────────
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

// ─── SOCKET.IO EVENT HANDLERS ───────────────────────────────────────────
io.on('connection', (socket) => {
  let currentLobbyCode = null;
  let currentGameRoom = null;
  
  console.log(`[Socket] New connection: ${socket.id}`);

  // Handle joining a game from lobby
  socket.on('joinGame', ({ lobbyCode, playerInfo }) => {
    console.log(`[Socket:${socket.id}] Joining game for lobby: ${lobbyCode}`);
    
    // Leave previous room if any
    if (currentLobbyCode) {
      socket.leave(currentLobbyCode);
      if (currentGameRoom) {
        currentGameRoom.removePlayer(socket.id);
      }
    }

    // Join new room
    currentLobbyCode = lobbyCode;
    socket.join(lobbyCode);
    
    // Get or create game room
    currentGameRoom = getOrCreateGameRoom(lobbyCode);
    currentGameRoom.addPlayer(socket.id, playerInfo);
    
    console.log(`[Socket:${socket.id}] Successfully joined game room for lobby: ${lobbyCode}`);
  });

  // Handle drag interactions
  socket.on('startDrag', (data) => {
    if (currentGameRoom) {
      currentGameRoom.handleStartDrag(socket.id, data);
    }
  });

  socket.on('drag', (data) => {
    if (currentGameRoom) {
      currentGameRoom.handleDrag(socket.id, data);
    }
  });

  socket.on('endDrag', () => {
    if (currentGameRoom) {
      currentGameRoom.handleEndDrag(socket.id);
    }
  });

  // Handle mouse movement for cursor display
  socket.on('movemouse', (pos) => {
    if (currentLobbyCode) {
      socket.to(currentLobbyCode).emit('mouseMoved', {
        id: socket.id,
        x: pos.x,
        y: pos.y
      });
    }
  });

  socket.on('mouseLeave', () => {
    if (currentLobbyCode) {
      socket.to(currentLobbyCode).emit('mouseRemoved', { id: socket.id });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    
    if (currentGameRoom) {
      currentGameRoom.removePlayer(socket.id);
    }
    
    if (currentLobbyCode) {
      socket.to(currentLobbyCode).emit('mouseRemoved', { id: socket.id });
    }
  });
});

// ─── HTTP ROUTES ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const totalPlayers = Array.from(gameRooms.values())
    .reduce((sum, room) => sum + room.players.size, 0);
    
  res.json({ 
    status: 'ok', 
    activeRooms: gameRooms.size,
    totalPlayers,
    uptime: process.uptime()
  });
});

app.get('/rooms', (req, res) => {
  const roomInfo = Array.from(gameRooms.entries()).map(([lobbyCode, room]) => ({
    lobbyCode,
    playerCount: room.players.size,
    players: Array.from(room.players.values()).map(p => p.name)
  }));
  
  res.json(roomInfo);
});

// ─── START SERVER ──────────────────────────────────────────────────────
server.listen(CONFIG.PORT, () => {
  console.log(`🎮 Game server running on port ${CONFIG.PORT}`);
  console.log(`📊 Health check: http://localhost:${CONFIG.PORT}/health`);
  console.log(`📋 Room info: http://localhost:${CONFIG.PORT}/rooms`);
  console.log(`⚙️  Config: ${JSON.stringify(CONFIG, null, 2)}`);
});

// ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  
  // Cleanup all game rooms
  for (const [lobbyCode, room] of gameRooms) {
    room.cleanup();
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  
  // Cleanup all game rooms
  for (const [lobbyCode, room] of gameRooms) {
    room.cleanup();
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
