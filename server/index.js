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

// ——— CONFIG ———
const WALL_THICKNESS    = 10;
const RESPAWN_MARGIN    = 50;
const SCENE_FILE        = path.join(__dirname, 'scene.json');
const REPORT_TIMEOUT    = 5000;  // ms before a client is considered gone
const CLEANUP_INTERVAL  = 2000;  // ms between stale‐client sweeps

// ——— LOAD SCENE DATA ———
const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));

// ——— PHYSICS SETUP ———
const engine = Engine.create();
const world  = engine.world;

// static walls + floor
let walls = { left: null, right: null, bottom: null };
let canvasSize = { width: 800, height: 600 };
function recreateWalls() {
  if (walls.left) World.remove(world, [walls.left, walls.right, walls.bottom]);
  const { width, height } = canvasSize;
  const wallHeight = height * 20;

  walls.left   = Bodies.rectangle(-WALL_THICKNESS/2, height/2, WALL_THICKNESS, wallHeight, { isStatic: true });
  walls.right  = Bodies.rectangle(width + WALL_THICKNESS/2, height/2, WALL_THICKNESS, wallHeight, { isStatic: true });
  walls.bottom = Bodies.rectangle(width/2, height + WALL_THICKNESS/2, width + WALL_THICKNESS*2, WALL_THICKNESS, { isStatic: true });

  World.add(world, [walls.left, walls.right, walls.bottom]);
}
recreateWalls();

// create dynamic bodies from JSON
const bodies          = [];
const DYNAMIC_BODIES  = [];

for (const cfg of sceneData) {
  let body;
  const opts = {
    mass:        cfg.mass ?? 1,
    restitution: cfg.restitution ?? 0.2,
    friction:    cfg.friction ?? 0.1
  };
  if (cfg.type === 'circle') {
    body = Bodies.circle(cfg.x, cfg.y, cfg.radius, opts);
  } else if (cfg.type === 'rectangle') {
    body = Bodies.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, opts);
  } else {
    continue;
  }
  body.label = cfg.id;
  World.add(world, body);
  bodies.push({ body, renderHint: cfg });
  DYNAMIC_BODIES.push(body);
}

// track clients
const clientSizes    = new Map();
const lastReportTime = new Map();
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

// socket.io
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('initSize', ({ width, height }) => {
    clientSizes.set(socket.id, { width, height });
    lastReportTime.set(socket.id, Date.now());
    updateCanvasSize();
  });
  socket.on('disconnect', () => {
    clientSizes.delete(socket.id);
    lastReportTime.delete(socket.id);
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
    updateCanvasSize();
  });

  let dragConstraint = null;

  socket.on('startDrag', ({ id, x, y }) => {
    if (dragConstraint) return;

    const entry = bodies.find(o => o.renderHint.id === id);
    if (!entry) return;

    dragConstraint = Constraint.create({
      pointA: { x, y },
      bodyB: entry.body,
      pointB: { x: 0, y: 0 },
      stiffness: 0.1,
      damping: 0.02
    });
    World.add(world, dragConstraint);
  });

  socket.on('drag', ({ x, y }) => {
    if (dragConstraint) {
      dragConstraint.pointA.x = x;
      dragConstraint.pointA.y = y;
    }
  });

  socket.on('endDrag', () => {
    if (dragConstraint) {
      World.remove(world, dragConstraint);
      dragConstraint = null;
    }
  });

  socket.on('movemouse', pos => io.emit('mouseMoved', { id: socket.id, ...pos }));
  socket.on('mouseLeave', () => socket.broadcast.emit('mouseRemoved', { id: socket.id }));
});

setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of lastReportTime.entries()) {
    if (now - ts > REPORT_TIMEOUT) {
      lastReportTime.delete(id);
      clientSizes.delete(id);
      io.emit('mouseRemoved', { id });
      updateCanvasSize();
      console.log(`Removed stale client ${id}`);
    }
  }
}, CLEANUP_INTERVAL);

// physics + state broadcast
setInterval(() => {
  Engine.update(engine, 1000/60);

  // respawn if fallen
  const floorY = canvasSize.height + WALL_THICKNESS/2;
  for (const body of DYNAMIC_BODIES) {
    if (body.position.y > floorY + RESPAWN_MARGIN) {
      Body.setPosition(body, { x: 300, y: 100 });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Body.setAngle(body, 0);
    }
  }

  io.emit('state',
    bodies.map(({ body, renderHint }) => ({
      id:    body.label,
      x:     body.position.x,
      y:     body.position.y,
      angle: body.angle,
      image: renderHint.image,
      width: renderHint.width,
      height:renderHint.height
    }))
  );
}, 1000/60);

server.listen(3000, () => console.log('Server listening on http://localhost:3000'));
