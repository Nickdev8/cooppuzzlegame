const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const Matter = require('matter-js');

const { Engine, World, Bodies, Body, Constraint } = Matter;

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const WALL_THICKNESS = 10;
const RESPAWN_MARGIN = 50;
const SCENE_FILE = path.join(__dirname, 'scene.json');

const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));

// ─── GAME ROOM MANAGEMENT ──────────────────────────────────────────────────
class GameRoom {
  constructor(lobbyCode) {
    this.lobbyCode = lobbyCode;
    this.players = new Set();
    this.engine = Engine.create();
    this.world = this.engine.world;
    this.canvasSize = { width: 1920, height: 1080 };
    this.walls = { left: null, right: null, bottom: null };
    this.bodies = [];
    this.dynamicBodies = [];
    this.anchoredBodies = [];
    this.dragConstraints = new Map(); // socketId -> constraint
    
    console.log(`[GameRoom] Creating new room for lobbyCode: ${lobbyCode}`);
    this.setupPhysics();
    this.setupScene();
    this.startGameLoop();
  }

  setupPhysics() {
    const { width, height } = this.canvasSize;
    const h = height * 20;
    console.log(`[GameRoom:${this.lobbyCode}] Setting up physics with canvas size`, this.canvasSize);
    this.walls.left = Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    this.walls.right = Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    this.walls.bottom = Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true });

    World.add(this.world, [this.walls.left, this.walls.right, this.walls.bottom]);
  }

  setupScene() {
    console.log(`[GameRoom:${this.lobbyCode}] Setting up scene with`, sceneData.length, 'objects');
    for (const cfg of sceneData) {
      let baseX, baseY;
      if (cfg.screen) {
        baseX = this.canvasSize.width * (cfg.screen.xPercent ?? 0) + (cfg.offset?.x || 0);
        baseY = this.canvasSize.height * (cfg.screen.yPercent ?? 0) + (cfg.offset?.y || 0);
      } else {
        baseX = cfg.x;
        baseY = cfg.y;
      }

      const opts = {
        mass: cfg.mass ?? 1,
        restitution: cfg.restitution ?? 0.2,
        friction: cfg.friction ?? 0.1
      };

      let b;
      if (cfg.type === 'circle') {
        b = Bodies.circle(baseX, baseY, cfg.radius, opts);
      } else if (cfg.type === 'rectangle') {
        b = Bodies.rectangle(baseX, baseY, cfg.width, cfg.height, opts);
      } else {
        continue;
      }

      b.label = cfg.id;
      World.add(this.world, b);
      this.bodies.push({ body: b, renderHint: cfg });
      this.dynamicBodies.push(b);

      // attach any fixed-point constraints
      if (Array.isArray(cfg.fixedPoints)) {
        const w = cfg.width ?? cfg.radius * 2;
        const h = cfg.height ?? cfg.radius * 2;
        for (const fp of cfg.fixedPoints) {
          const localX = fp.offsetX != null ? fp.offsetX : (fp.percentX ?? 0) * w;
          const localY = fp.offsetY != null ? fp.offsetY : (fp.percentY ?? 0) * h;
          const halfW = w / 2;
          const halfH = h / 2;
          const worldX = baseX + (localX - halfW);
          const worldY = baseY + (localY - halfH);
          const C = Constraint.create({
            pointA: { x: worldX, y: worldY },
            bodyB: b,
            pointB: { x: localX - halfW, y: localY - halfH },
            length: 0,
            stiffness: fp.stiffness ?? 1,
            damping: fp.damping ?? 0.1
          });
          World.add(this.world, C);
          this.anchoredBodies.push({ cfg, C, fp });
        }
      }
    }
  }

  startGameLoop() {
    console.log(`[GameRoom:${this.lobbyCode}] Starting game loop`);
    this.gameInterval = setInterval(() => {
      Engine.update(this.engine, 1000 / 60);

      const floorY = this.canvasSize.height + WALL_THICKNESS / 2;
      for (const b of this.dynamicBodies) {
        if (b.position.y > floorY + RESPAWN_MARGIN) {
          console.log(`[GameRoom:${this.lobbyCode}] Respawning body`, b.label);
          Body.setPosition(b, { x: 300, y: 100 });
          Body.setVelocity(b, { x: 0, y: 0 });
          Body.setAngularVelocity(b, 0);
          Body.setAngle(b, 0);
        }
      }

      // Send state to all players in this room
      const state = {
        bodies: this.bodies.map(({ body, renderHint }) => ({
          id: body.label,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          image: renderHint.image,
          width: renderHint.width,
          height: renderHint.height
        })),
        anchors: this.anchoredBodies.map(({ C }) => C.pointA)
      };
      if (this.players.size > 0) {
        console.log(`[GameRoom:${this.lobbyCode}] Emitting state to ${this.players.size} players. Bodies: ${state.bodies.length}, Anchors: ${state.anchors.length}`);
      }
      io.to(this.lobbyCode).emit('state', state);
    }, 1000 / 60);
  }

  addPlayer(socketId) {
    this.players.add(socketId);
    console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} joined. Total players: ${this.players.size}`);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    // Remove any drag constraints for this player
    const dragC = this.dragConstraints.get(socketId);
    if (dragC) {
      World.remove(this.world, dragC);
      this.dragConstraints.delete(socketId);
      console.log(`[GameRoom:${this.lobbyCode}] Removed drag constraint for player ${socketId}`);
    }
    console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} left. Total players: ${this.players.size}`);
    
    // If no players left, clean up the room
    if (this.players.size === 0) {
      this.cleanup();
    }
  }

  handleStartDrag(socketId, { id, x, y }) {
    const existingDrag = this.dragConstraints.get(socketId);
    if (existingDrag) return;
    
    const entry = this.bodies.find(o => o.renderHint.id === id);
    if (!entry) return;
    
    const dragC = Constraint.create({ 
      pointA: { x, y }, 
      bodyB: entry.body, 
      pointB: { x: 0, y: 0 }, 
      stiffness: 0.1, 
      damping: 0.02 
    });
    World.add(this.world, dragC);
    this.dragConstraints.set(socketId, dragC);
    console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} started dragging ${id}`);
  }

  handleDrag(socketId, { x, y }) {
    const dragC = this.dragConstraints.get(socketId);
    if (dragC) {
      dragC.pointA.x = x;
      dragC.pointA.y = y;
      // Optionally log drag updates, but can be noisy
    }
  }

  handleEndDrag(socketId) {
    const dragC = this.dragConstraints.get(socketId);
    if (dragC) {
      World.remove(this.world, dragC);
      this.dragConstraints.delete(socketId);
      console.log(`[GameRoom:${this.lobbyCode}] Player ${socketId} ended drag`);
    }
  }

  cleanup() {
    console.log(`[GameRoom:${this.lobbyCode}] Cleaning up game room`);
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
    }
    gameRooms.delete(this.lobbyCode);
  }
}

// Store active game rooms
const gameRooms = new Map(); // lobbyCode -> GameRoom

// ─── SOCKET.IO HANDLERS ───────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoom = null;
  console.log(`[Socket] New connection: ${socket.id}`);

  socket.on('joinGame', ({ lobbyCode }) => {
    console.log(`[Socket:${socket.id}] joinGame for lobby ${lobbyCode}`);
    
    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const room = gameRooms.get(currentRoom);
      if (room) {
        room.removePlayer(socket.id);
      }
    }

    // Join new room
    currentRoom = lobbyCode;
    socket.join(lobbyCode);
    
    // Create or get existing game room
    let gameRoom = gameRooms.get(lobbyCode);
    if (!gameRoom) {
      gameRoom = new GameRoom(lobbyCode);
      gameRooms.set(lobbyCode, gameRoom);
      console.log(`Created new game room for lobby ${lobbyCode}`);
    }
    
    gameRoom.addPlayer(socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    if (currentRoom) {
      const room = gameRooms.get(currentRoom);
      if (room) {
        room.removePlayer(socket.id);
      }
    }
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
  });

  socket.on('startDrag', (data) => {
    console.log(`[Socket:${socket.id}] startDrag`, data);
    if (currentRoom) {
      const room = gameRooms.get(currentRoom);
      if (room) {
        room.handleStartDrag(socket.id, data);
      }
    }
  });

  socket.on('drag', (data) => {
    // Optionally log drag events
    // console.log(`[Socket:${socket.id}] drag`, data);
    if (currentRoom) {
      const room = gameRooms.get(currentRoom);
      if (room) {
        room.handleDrag(socket.id, data);
      }
    }
  });

  socket.on('endDrag', () => {
    console.log(`[Socket:${socket.id}] endDrag`);
    if (currentRoom) {
      const room = gameRooms.get(currentRoom);
      if (room) {
        room.handleEndDrag(socket.id);
      }
    }
  });

  socket.on('movemouse', pos => {
    // Optionally log mouse move events
    // console.log(`[Socket:${socket.id}] movemouse`, pos);
    socket.to(currentRoom).emit('mouseMoved', {
      id: socket.id,
      x: pos.x,
      y: pos.y
    });
  });

  socket.on('mouseLeave', () => {
    console.log(`[Socket:${socket.id}] mouseLeave`);
    socket.to(currentRoom).emit('mouseRemoved', { id: socket.id });
  });
});

// ─── HTTP ROUTES ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeRooms: gameRooms.size,
    totalPlayers: Array.from(gameRooms.values()).reduce((sum, room) => sum + room.players.size, 0)
  });
});

// ─── START SERVER ────────────────────────────────────────────────────────
const PORT = process.env.GAME_PORT || 3080;
server.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
