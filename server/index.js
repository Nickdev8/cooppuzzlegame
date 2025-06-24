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

// ─── LOBBY SUPPORT ───────────────────────────────────────────────────────
const LOBBY_SCENE_FILE = path.join(__dirname, 'scene.json');
const lobbies = new Map(); // lobbyCode -> { engine, world, bodies, DYNAMIC_BODIES, anchoredBodies, walls, canvasSize }

function createLobby(lobbyCode) {
  const sceneData = JSON.parse(fs.readFileSync(LOBBY_SCENE_FILE, 'utf-8'));
  const engine = Matter.Engine.create();
  const world = engine.world;
  const canvasSize = { width: 1920, height: 1080 };
  const WALL_THICKNESS = 10;
  let walls = { left: null, right: null, bottom: null };
  let anchoredBodies = [];

  function recreateWalls() {
    if (walls.left) Matter.World.remove(world, [walls.left, walls.right, walls.bottom]);
    const { width, height } = canvasSize;
    const h = height * 20;
    walls.left = Matter.Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    walls.right = Matter.Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, h, { isStatic: true });
    walls.bottom = Matter.Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true });
    Matter.World.add(world, [walls.left, walls.right, walls.bottom]);
  }
  recreateWalls();

  const bodies = [], DYNAMIC_BODIES = [];
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
      b = Matter.Bodies.circle(baseX, baseY, cfg.radius, opts);
    } else if (cfg.type === 'rectangle') {
      b = Matter.Bodies.rectangle(baseX, baseY, cfg.width, cfg.height, opts);
    } else {
      continue;
    }
    b.label = cfg.id;
    Matter.World.add(world, b);
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
        const C = Matter.Constraint.create({
          pointA: { x: worldX, y: worldY },
          bodyB: b,
          pointB: { x: localX - halfW, y: localY - halfH },
          length: 0,
          stiffness: fp.stiffness ?? 1,
          damping: fp.damping ?? 0.1
        });
        Matter.World.add(world, C);
        anchoredBodies.push({ cfg, C, fp });
      }
    }
  }
  return { engine, world, bodies, DYNAMIC_BODIES, anchoredBodies, walls, canvasSize };
}

// Map socket.id -> lobbyCode
const playerLobbies = new Map();

// ─── PHYSICS SETUP ─────────────────────────────────────────────────────────
const engine = Engine.create();
const world = engine.world;

let walls = { left: null, right: null, bottom: null };
let canvasSize = { width: 1920, height: 1080 };

const anchoredBodies = [];

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

const bodies = [], DYNAMIC_BODIES = [];

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
      World.add(world, C);
      anchoredBodies.push({ cfg, C, fp });
    }
  }
}

io.on('connection', socket => {
  let dragC = null;
  let lobbyCode = null;
  let lobby = null;

  socket.on('joinGame', ({ lobbyCode: code }) => {
    lobbyCode = code;
    playerLobbies.set(socket.id, lobbyCode);
    if (!lobbies.has(lobbyCode)) {
      lobbies.set(lobbyCode, createLobby(lobbyCode));
    }
    lobby = lobbies.get(lobbyCode);
    socket.join(lobbyCode);
    // Optionally: send current state to the new player
    // (could add player info here if needed)
  });

  socket.on('disconnect', () => {
    playerLobbies.delete(socket.id);
    socket.broadcast.to(lobbyCode).emit('mouseRemoved', { id: socket.id });
    // Optionally: clean up empty lobbies
    if (lobbyCode && io.sockets.adapter.rooms.get(lobbyCode)?.size === 0) {
      lobbies.delete(lobbyCode);
    }
  });

  socket.on('startDrag', ({ id, x, y }) => {
    if (!lobby) return;
    if (dragC) return;
    const entry = lobby.bodies.find(o => o.renderHint.id === id);
    if (!entry) return;
    dragC = Constraint.create({ pointA: { x, y }, bodyB: entry.body, pointB: { x: 0, y: 0 }, stiffness: 0.1, damping: 0.02 });
    World.add(lobby.world, dragC);
  });

  socket.on('drag', ({ x, y }) => {
    if (!lobby) return;
    if (dragC) {
      dragC.pointA.x = x;
      dragC.pointA.y = y;
    }
  });

  socket.on('endDrag', () => {
    if (!lobby) return;
    if (dragC) {
      World.remove(lobby.world, dragC);
      dragC = null;
    }
  });

  socket.on('movemouse', pos => {
    if (!lobbyCode) return;
    socket.broadcast.to(lobbyCode).emit('mouseMoved', {
      id: socket.id,
      x: pos.x,
      y: pos.y
    });
  });

  socket.on('mouseLeave', () => {
    if (!lobbyCode) return;
    socket.broadcast.to(lobbyCode).emit('mouseRemoved', { id: socket.id });
  });
});

setInterval(() => {
  for (const [lobbyCode, lobby] of lobbies.entries()) {
    Matter.Engine.update(lobby.engine, 1000 / 60);
    const floorY = lobby.canvasSize.height + 10 / 2;
    for (const b of lobby.DYNAMIC_BODIES) {
      if (b.position.y > floorY + 50) {
        Matter.Body.setPosition(b, { x: 300, y: 100 });
        Matter.Body.setVelocity(b, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(b, 0);
        Matter.Body.setAngle(b, 0);
      }
    }
    io.to(lobbyCode).emit('state', {
      bodies: lobby.bodies.map(({ body, renderHint }) => ({
        id: body.label,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        image: renderHint.image,
        width: renderHint.width,
        height: renderHint.height
      })),
      anchors: lobby.anchoredBodies.map(({ C }) => C.pointA)
    });
  }
}, 1000 / 60);

server.listen(3080, () => console.log('Server on https://iotservice.nl:3080'));