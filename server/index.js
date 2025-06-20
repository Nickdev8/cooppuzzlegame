const express = require('express');
const http    = require('http');
const cors    = require('cors');
const { Server } = require('socket.io');
const Matter  = require('matter-js');

const { Engine, World, Bodies, Body, Constraint } = Matter;

const app    = express();
app.use(cors());
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ——— CONFIG ———
const WALL_THICKNESS     = 10;          // thickness of walls & floor
const RESPAWN_MARGIN     = 50;          // extra px below floor to trigger respawn
const INITIAL_BALL_POS   = { x: 300, y: 100 };
const DYNAMIC_BODIES     = [];          // we'll push the ball here

// ——— PHYSICS SETUP ———
const engine = Engine.create();
const world  = engine.world;

// Create the ball and register it for respawn checks
const ball = Bodies.circle(INITIAL_BALL_POS.x, INITIAL_BALL_POS.y, 20);
World.add(world, [ball]);
DYNAMIC_BODIES.push(ball);

// Container for walls/floor bodies
let walls = { left: null, right: null, bottom: null };

// Default canvas size (before any clients connect)
let canvasSize = { width: 800, height: 600 };

// Builds (or rebuilds) the side-walls and single floor collider
function recreateWalls() {
  // remove old bodies if present
  if (walls.left) {
    World.remove(world, [walls.left, walls.right, walls.bottom]);
  }

  const { width, height } = canvasSize;
  const wallHeight = height * 20;  // “almost infinite”

  walls.left  = Bodies.rectangle(-WALL_THICKNESS/2, height/2, WALL_THICKNESS, wallHeight, { isStatic: true });
  walls.right = Bodies.rectangle(width + WALL_THICKNESS/2, height/2, WALL_THICKNESS, wallHeight, { isStatic: true });
  walls.bottom = Bodies.rectangle(
    width/2,
    height + WALL_THICKNESS/2,
    width + WALL_THICKNESS*2,
    WALL_THICKNESS,
    { isStatic: true }
  );

  World.add(world, [walls.left, walls.right, walls.bottom]);
}
recreateWalls();

// Track all clients’ viewport sizes to compute min canvas
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

// ——— Socket.io Handlers ———
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('initSize', ({ width, height }) => {
    clientSizes.set(socket.id, { width, height });
    updateCanvasSize();
  });

  socket.on('disconnect', () => {
    clientSizes.delete(socket.id);
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
    updateCanvasSize();
  });

  // drag & throw (unchanged) …
  let dragConstraint = null;
  socket.on('startDrag', ({ x, y }) => {
    if (dragConstraint) return;
    dragConstraint = Constraint.create({
      pointA: { x, y },
      bodyB: ball,
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

  // mouse tracking (unchanged) …
  socket.on('movemouse', ({ x, y }) => {
    io.emit('mouseMoved', { id: socket.id, x, y });
  });
  socket.on('mouseLeave', () => {
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
  });
});

// ——— Physics Loop + Respawn Logic ———
setInterval(() => {
  Engine.update(engine, 1000 / 60);

  // Respawn any body that falls below the floor + margin
  const floorY = canvasSize.height + WALL_THICKNESS/2;
  for (const body of DYNAMIC_BODIES) {
    if (body.position.y > floorY + RESPAWN_MARGIN) {
      // reset position & zero out velocity/rotation
      Body.setPosition(body, INITIAL_BALL_POS);
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Body.setAngle(body, 0);
    }
  }

  // broadcast updated state
  io.emit('state', [
    { id: 'ball', x: ball.position.x, y: ball.position.y }
  ]);
}, 1000 / 60);

// ——— Start Server ———
server.listen(3000, () => console.log('Server running on http://localhost:3000'));
