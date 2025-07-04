const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const Matter = require('matter-js');

const { Engine, World, Bodies, Body } = Matter;

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const WALL_THICKNESS = 10;
const RESPAWN_MARGIN = 50;
const SCENE_FILE = path.join(__dirname, 'scene.json');

// ─── LOBBY PHYSICS SUPPORT ─────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { engine, world, bodies, DYNAMIC_BODIES, walls, canvasSize, interval, sockets: Set }

// Global lobby for unlimited players
let globalLobby = null;

// Clear existing lobbies to ensure new canvas dimensions are used
function clearExistingLobbies() {
  lobbies.clear();
  globalLobby = null;
  console.log('Cleared existing lobbies to use new canvas dimensions (2048x1024)');
}

function createGlobalLobby() {
  if (!globalLobby) {
    console.log('🌍 [DEBUG] Creating global lobby...');
    globalLobby = createLobbyWorld('GLOBAL');
    globalLobby.isGlobal = true;
    globalLobby.maxPlayers = Infinity; // Unlimited players
    console.log('🌍 [DEBUG] Global lobby created with', globalLobby.bodies.length, 'objects');
  }
  return globalLobby;
}

function getGlobalLobby() {
  return createGlobalLobby();
}

function createLobbyWorld(lobbyCode) {
  const engine = Engine.create();
  const world = engine.world;
  let canvasSize = { width: 2048, height: 1024 }; // 2:1 aspect ratio
  let walls = { left: null, right: null, bottom: null };
  let bodies = [], DYNAMIC_BODIES = [];

  function recreateWalls() {
    if (walls.left) World.remove(world, [walls.left, walls.right, walls.bottom]);
    const { width, height } = canvasSize;
    const h = height * 20;
    walls.left = Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    walls.right = Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    walls.bottom = Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true });
    World.add(world, [walls.left, walls.right, walls.bottom]);
  }
  recreateWalls();

  const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));
  for (const cfg of sceneData) {
    let baseX, baseY;
    if (cfg.screen) {
      baseX = canvasSize.width * (cfg.screen.xPercent ?? 0) + (cfg.offset?.x || 0);
      baseY = canvasSize.height * (cfg.screen.yPercent ?? 0) + (cfg.offset?.y || 0);
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
    World.add(world, b);
    bodies.push({ body: b, renderHint: cfg });
    DYNAMIC_BODIES.push(b);
  }
  return { engine, world, bodies, DYNAMIC_BODIES, walls, canvasSize, sockets: new Set() };
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
    socket.emit('joinedPhysics');
  });

  socket.on('startDrag', ({ id, x, y }) => {
    if (!lobbyWorld) return;
    const entry = lobbyWorld.bodies.find(o => o.renderHint.id === id);
    if (!entry) return;
    
    // Store drag data for this client
    const body = entry.body;
    const initialAngle = body.angle;
    socket.dragData = {
      body: body,
      initialAngle: initialAngle,
      offsetX: x - body.position.x,
      offsetY: y - body.position.y
    };
  });

  socket.on('drag', ({ x, y }) => {
    if (!lobbyWorld) return;
    if (socket.dragData) {
      // Calculate new position based on mouse and stored offset
      const newX = x - socket.dragData.offsetX;
      const newY = y - socket.dragData.offsetY;
      
      // Directly set position and preserve initial rotation
      Body.setPosition(socket.dragData.body, { x: newX, y: newY });
      Body.setAngle(socket.dragData.body, socket.dragData.initialAngle);
      Body.setAngularVelocity(socket.dragData.body, 0);
      Body.setVelocity(socket.dragData.body, { x: 0, y: 0 });
    }
  });

  socket.on('endDrag', ({ velocity }) => {
    if (!lobbyWorld) return;
    if (socket.dragData) {
      // Apply throw velocity to the object
      if (velocity && (velocity.x !== 0 || velocity.y !== 0)) {
        const body = socket.dragData.body;
        // Apply the throw velocity (convert from pixels/sec to Matter.js units)
        Body.setVelocity(body, { 
          x: velocity.x * 0.01, // Scale down for less powerful throws
          y: velocity.y * 0.01 
        });
      } else {
        // No velocity or zero velocity - just stop the object
        const body = socket.dragData.body;
        Body.setVelocity(body, { x: 0, y: 0 });
      }
      
      // Clear drag data
      socket.dragData = null;
    }
  });

  socket.on('movemouse', pos => {
    if (!lobbyWorld) return;
    socket.to(lobbyCode).emit('mouseMoved', {
      id: socket.id,
      x: pos.x,
      y: pos.y
    });
  });

  socket.on('mouseLeave', () => {
    if (!lobbyWorld) return;
    socket.to(lobbyCode).emit('mouseRemoved', { id: socket.id });
  });

  socket.on('disconnect', () => {
    if (lobbyWorld) {
      // Clean up any drag data
      if (socket.dragData) {
        socket.dragData = null;
      }
      
      lobbyWorld.sockets.delete(socket);
      socket.to(lobbyCode).emit('mouseRemoved', { id: socket.id });
      if (lobbyWorld.sockets.size === 0) {
        // Clean up lobby world
        lobbies.delete(lobbyCode);
      }
    }
  });
});

// ─── PHYSICS UPDATE LOOP ───────────────────────────────────────────────
setInterval(() => {
  // Update regular lobbies
  for (const [lobbyCode, lobbyWorld] of lobbies.entries()) {
    // Run physics simulation on all objects
    Engine.update(lobbyWorld.engine, 1000 / 60);
    
    const floorY = lobbyWorld.canvasSize.height + WALL_THICKNESS / 2;
    
    for (const b of lobbyWorld.DYNAMIC_BODIES) {
      // Respawn objects that fall below screen
      if (b.position.y > floorY + RESPAWN_MARGIN) {
        // Respawn at 15% from left, 2% from top of canvas
        const respawnX = lobbyWorld.canvasSize.width * 0.15;
        const respawnY = lobbyWorld.canvasSize.height * 0.02;
        Body.setPosition(b, { x: respawnX, y: respawnY });
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
        Body.setAngle(b, 0);
      }
    }
    
    io.to(lobbyCode).emit('state', {
      bodies: lobbyWorld.bodies.map(({ body, renderHint }) => ({
        id: body.label,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        image: renderHint.image,
        width: renderHint.width,
        height: renderHint.height
      })),
      anchors: []
    });
  }
  
  // Update global lobby
  if (globalLobby) {
    // Run physics simulation on all objects
    Engine.update(globalLobby.engine, 1000 / 60);
    
    const floorY = globalLobby.canvasSize.height + WALL_THICKNESS / 2;
    
    for (const b of globalLobby.DYNAMIC_BODIES) {
      // Respawn objects that fall below screen
      if (b.position.y > floorY + RESPAWN_MARGIN) {
        // Respawn at 15% from left, 2% from top of canvas
        const respawnX = globalLobby.canvasSize.width * 0.15;
        const respawnY = globalLobby.canvasSize.height * 0.02;
        Body.setPosition(b, { x: respawnX, y: respawnY });
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
        Body.setAngle(b, 0);
      }
    }
    
    io.to('GLOBAL').emit('state', {
      bodies: globalLobby.bodies.map(({ body, renderHint }) => ({
        id: body.label,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        image: renderHint.image,
        width: renderHint.width,
        height: renderHint.height
      })),
      anchors: []
    });
  }
}, 1000 / 60);

// ─── HTTP ROUTES ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lobbies: lobbies.size });
});

app.get('/api/global-player-count', (req, res) => {
  const count = globalLobby ? globalLobby.sockets.size : 0;
  res.json({ count });
});

server.listen(3080, () => {
  console.log('Server on https://iotservice.nl:3080');
  clearExistingLobbies(); // Clear existing lobbies to use new canvas dimensions
});