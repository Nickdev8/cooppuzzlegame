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

const WALL_THICKNESS     = 10;
const RESPAWN_MARGIN     = 50;
const INITIAL_BALL_POS   = { x: 300, y: 100 };
const DYNAMIC_BODIES     = [];

const engine = Engine.create();
const world  = engine.world;

const ball = Bodies.circle(INITIAL_BALL_POS.x, INITIAL_BALL_POS.y, 20);
World.add(world, [ball]);
DYNAMIC_BODIES.push(ball);

let walls = { left: null, right: null, bottom: null };

let canvasSize = { width: 800, height: 600 };

function recreateWalls() {
  if (walls.left) {
    World.remove(world, [walls.left, walls.right, walls.bottom]);
  }

  const { width, height } = canvasSize;
  const wallHeight = height * 20;

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

  socket.on('movemouse', ({ x, y }) => {
    io.emit('mouseMoved', { id: socket.id, x, y });
  });
  socket.on('mouseLeave', () => {
    socket.broadcast.emit('mouseRemoved', { id: socket.id });
  });
});

setInterval(() => {
  Engine.update(engine, 1000 / 60);

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

  io.emit('state', [
    { id: 'ball', x: ball.position.x, y: ball.position.y }
  ]);
}, 1000 / 60);

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
