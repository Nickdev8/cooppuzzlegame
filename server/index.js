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
const CLIENT_SIDE_OWNERSHIP_ENABLED = true; // Always enable client-side ownership for better responsiveness

// ─── LOBBY PHYSICS SUPPORT ─────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { engine, world, bodies, DYNAMIC_BODIES, anchoredBodies, walls, canvasSize, interval, sockets: Set }

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
  const engine = Engine.create();
  const world = engine.world;
  let canvasSize = { width: 2048, height: 1024 }; // 2:1 aspect ratio
  let walls = { left: null, right: null, bottom: null };
  let anchoredBodies = [];
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
          stiffness: fp.stiffness ?? 0.9,
          damping: fp.damping ?? 0.8,
          render: {
            visible: false
          }
        });
        World.add(world, C);
        anchoredBodies.push({ cfg, C, fp });
      }
    }
  }
  return { engine, world, bodies, DYNAMIC_BODIES, anchoredBodies, walls, canvasSize, sockets: new Set() };
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
  let dragC = null;
  socket.ownedObjects = new Set(); // Track objects owned by this client

  socket.on('joinPhysics', ({ lobby }) => {
    lobbyCode = lobby;
    lobbyWorld = getLobbyWorld(lobbyCode);
    lobbyWorld.sockets.add(socket);
    socket.join(lobbyCode);
    socket.emit('joinedPhysics', { clientSideOwnershipEnabled: CLIENT_SIDE_OWNERSHIP_ENABLED });
  });

  socket.on('startDrag', ({ id, x, y }) => {
    if (!lobbyWorld) return;
    if (dragC) return;
    const entry = lobbyWorld.bodies.find(o => o.renderHint.id === id);
    if (!entry) return;
    
    // Check if object has anchors - if so, don't allow dragging
    if (Array.isArray(entry.renderHint.fixedPoints) && entry.renderHint.fixedPoints.length > 0) {
      console.log('Client attempted to drag anchored object:', id);
      return;
    }
    
    // Mark this object as owned by this client
    socket.ownedObjects.add(id);
    
    dragC = Constraint.create({ pointA: { x, y }, bodyB: entry.body, pointB: { x: 0, y: 0 }, stiffness: 0.1, damping: 0.02 });
    World.add(lobbyWorld.world, dragC);
  });

  socket.on('drag', ({ x, y }) => {
    if (!lobbyWorld) return;
    if (dragC) {
      dragC.pointA.x = x;
      dragC.pointA.y = y;
    }
  });

  socket.on('endDrag', () => {
    if (!lobbyWorld) return;
    if (dragC) {
      World.remove(lobbyWorld.world, dragC);
      dragC = null;
    }
    // Clear ownership when drag ends
    socket.ownedObjects.clear();
  });

  socket.on('removeAnchor', ({ index, x, y }) => {
    if (!lobbyWorld) return;
    
    // Find the anchor at the specified index
    if (index >= 0 && index < lobbyWorld.anchoredBodies.length) {
      const anchorData = lobbyWorld.anchoredBodies[index];
      console.log('Removing anchor:', { index, x, y, objectId: anchorData.cfg.id });
      
      // Remove the constraint from the world
      World.remove(lobbyWorld.world, anchorData.C);
      
      // Remove the anchor from the anchoredBodies array
      lobbyWorld.anchoredBodies.splice(index, 1);
      
      // Update the object's hasAnchors property by removing the corresponding fixedPoint
      const objectEntry = lobbyWorld.bodies.find(o => o.renderHint.id === anchorData.cfg.id);
      if (objectEntry && Array.isArray(objectEntry.renderHint.fixedPoints)) {
        // Find the fixed point that corresponds to this specific anchor
        // We can match by comparing the anchor's fixed point data
        const fixedPointIndex = objectEntry.renderHint.fixedPoints.findIndex(fp => {
          // Match by comparing the fixed point properties
          return fp.offsetX === anchorData.fp.offsetX && 
                 fp.offsetY === anchorData.fp.offsetY &&
                 fp.percentX === anchorData.fp.percentX &&
                 fp.percentY === anchorData.fp.percentY;
        });
        
        if (fixedPointIndex !== -1) {
          objectEntry.renderHint.fixedPoints.splice(fixedPointIndex, 1);
          console.log(`Removed fixed point ${fixedPointIndex} from object ${anchorData.cfg.id}`);
        } else {
          console.log(`Could not find matching fixed point for anchor ${index}`);
        }
      }
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
      lobbyWorld.sockets.delete(socket);
      socket.to(lobbyCode).emit('mouseRemoved', { id: socket.id });
      // Clear any owned objects when client disconnects
      socket.ownedObjects.clear();
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
    Engine.update(lobbyWorld.engine, 1000 / 60);
    const floorY = lobbyWorld.canvasSize.height + WALL_THICKNESS / 2;
    
    // Track which objects are being dragged by clients
    const draggedObjects = new Set();
    for (const socket of lobbyWorld.sockets) {
      if (socket.ownedObjects) {
        socket.ownedObjects.forEach(id => draggedObjects.add(id));
      }
    }
    
    for (const b of lobbyWorld.DYNAMIC_BODIES) {
      // Only respawn objects that aren't being dragged
      if (!draggedObjects.has(b.label) && b.position.y > floorY + RESPAWN_MARGIN) {
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
      bodies: lobbyWorld.bodies.map(({ body, renderHint }) => {
        // Debug rotation occasionally
        if (Math.random() < 0.01) { // 1% chance to log
          console.log(`[server] Sending ${body.label}: angle=${body.angle.toFixed(3)}, pos=(${body.position.x.toFixed(1)}, ${body.position.y.toFixed(1)})`);
        }
        return {
          id: body.label,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          image: renderHint.image,
          width: renderHint.width,
          height: renderHint.height,
          hasAnchors: Array.isArray(renderHint.fixedPoints) && renderHint.fixedPoints.length > 0
        };
      }),
      anchors: lobbyWorld.anchoredBodies.map(({ C }) => C.pointA)
    });
  }
  
  // Update global lobby
  if (globalLobby) {
    Engine.update(globalLobby.engine, 1000 / 60);
    const floorY = globalLobby.canvasSize.height + WALL_THICKNESS / 2;
    
    // Track which objects are being dragged by clients
    const draggedObjects = new Set();
    for (const socket of globalLobby.sockets) {
      if (socket.ownedObjects) {
        socket.ownedObjects.forEach(id => draggedObjects.add(id));
      }
    }
    
    for (const b of globalLobby.DYNAMIC_BODIES) {
      // Only respawn objects that aren't being dragged
      if (!draggedObjects.has(b.label) && b.position.y > floorY + RESPAWN_MARGIN) {
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
      bodies: globalLobby.bodies.map(({ body, renderHint }) => {
        // Debug rotation occasionally
        if (Math.random() < 0.01) { // 1% chance to log
          console.log(`[server] Sending ${body.label}: angle=${body.angle.toFixed(3)}, pos=(${body.position.x.toFixed(1)}, ${body.position.y.toFixed(1)})`);
        }
        return {
          id: body.label,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          image: renderHint.image,
          width: renderHint.width,
          height: renderHint.height,
          hasAnchors: Array.isArray(renderHint.fixedPoints) && renderHint.fixedPoints.length > 0
        };
      }),
      anchors: globalLobby.anchoredBodies.map(({ C }) => C.pointA)
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