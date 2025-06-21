const express = require('express');
const http    = require('http');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');
const Matter  = require('matter-js');

const { Engine, World, Bodies, Body, Constraint } = Matter;

const app    = express();
app.use(cors());
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const WALL_THICKNESS   = 10;
const RESPAWN_MARGIN   = 50;
const SCENE_FILE       = path.join(__dirname, 'scene.json');
const CLEANUP_INTERVAL = 2000;  // ms between stale‐client sweeps

// ─── LOAD SCENE ─────────────────────────────────────────────────────────────
const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));

// ─── PHYSICS SETUP ─────────────────────────────────────────────────────────
const engine = Engine.create();
const world  = engine.world;

// static walls + floor
let walls = { left: null, right: null, bottom: null };
let canvasSize = { width: 800, height: 600 };

function recreateWalls() {
  if (walls.left) World.remove(world, [walls.left, walls.right, walls.bottom]);
  const { width, height } = canvasSize;
  const h = height * 20;  // effectively infinite

  walls.left   = Bodies.rectangle(-WALL_THICKNESS/2, height/2, WALL_THICKNESS, h, { isStatic: true });
  walls.right  = Bodies.rectangle(width + WALL_THICKNESS/2, height/2, WALL_THICKNESS, h, { isStatic: true });
  walls.bottom = Bodies.rectangle(width/2, height + WALL_THICKNESS/2, width + WALL_THICKNESS*2, WALL_THICKNESS, { isStatic: true });

  World.add(world, [walls.left, walls.right, walls.bottom]);
}
recreateWalls();

// dynamic bodies
const bodies = [], DYNAMIC_BODIES = [];

for (const cfg of sceneData) {
  let b, opts = {
    mass: cfg.mass  ?? 1,
    restitution: cfg.restitution ?? 0.2,
    friction: cfg.friction ?? 0.1
  };

  if (cfg.type === 'circle') {
    b = Bodies.circle(cfg.x, cfg.y, cfg.radius, opts);
  } else if (cfg.type === 'rectangle') {
    b = Bodies.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, opts);
  } else {
    continue;
  }

  b.label = cfg.id;
  World.add(world, b);
  bodies.push({ body: b, renderHint: cfg });
  DYNAMIC_BODIES.push(b);
}

// client tracking
const clientSizes = new Map();

function updateCanvasSize() {
  let minW = Infinity, minH = Infinity;
  for (const { width, height } of clientSizes.values()) {
    minW = Math.min(minW, width);
    minH = Math.min(minH, height);
  }
  if (minW === Infinity) return;

  canvasSize = { width: minW, height: minH };
  io.emit('canvasSize', canvasSize);
  recreateWalls();
}

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('initSize', ({ width, height }) => {
    clientSizes.set(socket.id, { width, height });
    updateCanvasSize();
  });

  socket.on('disconnect', () => {
    clientSizes.delete(socket.id);
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
    updateCanvasSize();
  });

  // drag & throw
  let dragC = null;
  socket.on('startDrag', ({ id, x, y }) => {
    if (dragC) return;
    const entry = bodies.find(o => o.renderHint.id === id);
    if (!entry) return;
    dragC = Constraint.create({ pointA: { x, y }, bodyB: entry.body, pointB: { x: 0, y: 0 }, stiffness: 0.1, damping: 0.02 });
    World.add(world, dragC);
  });
  socket.on('drag', ({ x, y }) => {
    if (dragC) {
      dragC.pointA.x = x;
      dragC.pointA.y = y;
    }
  });
  socket.on('endDrag', () => {
    if (dragC) {
      World.remove(world, dragC);
      dragC = null;
    }
  });

  // cursors
  socket.on('movemouse', pos => io.emit('mouseMoved', { id: socket.id, ...pos }));
  socket.on('mouseLeave', () => socket.broadcast.emit('mouseRemoved', { id: socket.id }));
});

// physics loop + state
setInterval(() => {
  Engine.update(engine, 1000/60);

  const floorY = canvasSize.height + WALL_THICKNESS/2;
  for (const b of DYNAMIC_BODIES) {
    if (b.position.y > floorY + RESPAWN_MARGIN) {
      Body.setPosition(b, { x: 300, y: 100 });
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setAngularVelocity(b, 0);
      Body.setAngle(b, 0);
    }
  }

  io.emit('state',
    bodies.map(({ body, renderHint }) => ({
      id:     body.label,
      x:      body.position.x,
      y:      body.position.y,
      angle:  body.angle,
      image:  renderHint.image,
      width:  renderHint.width,
      height: renderHint.height
    }))
  );
}, 1000/60);

server.listen(3080, () => console.log('Server on https://iotservice.nl:3080'));
