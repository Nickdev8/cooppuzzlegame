const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const Matter = require('matter-js');

const { Engine, World, Bodies, Body, Constraint, Events } = Matter;

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const WALL_THICKNESS = 10;
const RESPAWN_MARGIN = 50;
const SCENE_FILE = path.join(__dirname, 'scene.json');

// ─── LOBBY PHYSICS SUPPORT ─────────────────────────────────────────────
const lobbies = new Map(); // lobbyCode -> { engine, world, bodies, DYNAMIC_BODIES, grabbableBodies, walls, canvasSize, interval, sockets: Set, currentLevel, gameState }

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
  const engine = Engine.create({
    // Optimize for smooth ball rolling
    positionIterations: 6,
    velocityIterations: 4,
    constraintIterations: 2,
    enableSleeping: false // Keep objects active for better responsiveness
  });
  const world = engine.world;
  
  // Configure world for better ball physics
  world.gravity.y = 1; // Slightly reduced gravity for smoother rolling
  
  let canvasSize = { width: 2048, height: 1024 }; // 2:1 aspect ratio
  let walls = { left: null, right: null, bottom: null };
  let bodies = [], DYNAMIC_BODIES = [];
  let grabbableBodies = new Map(); // id -> { body, respawnLocation, originalData }
  let gameBall = null;
  let goal = null;
  let currentLevel = 0;
  let gameState = 'playing'; // 'playing', 'levelComplete', 'transitioning'
  let levelData = null;

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

  function loadLevel(levelIndex) {
    // Clear existing level
    World.clear(world, false);
    recreateWalls();
    bodies = [];
    DYNAMIC_BODIES = [];
    grabbableBodies.clear();
    gameBall = null;
    goal = null;
    
    // Load scene data
  const sceneData = JSON.parse(fs.readFileSync(SCENE_FILE, 'utf-8'));
    const levels = sceneData.levels;
    
    if (levelIndex >= levels.length) {
      console.log('All levels completed!');
      gameState = 'completed';
      return;
    }
    
    levelData = levels[levelIndex];
    currentLevel = levelIndex;
    gameState = 'playing';
    
    console.log(`Loading level ${levelIndex + 1}: ${levelData.name}`);
    
    // Create game ball
    const ballConfig = sceneData.gameConfig;
    const ballStart = levelData.ballStartLocation;
    gameBall = Bodies.circle(ballStart.x, ballStart.y, ballConfig.ballRadius, {
      mass: ballConfig.ballMass,
      restitution: ballConfig.ballRestitution || 0.6,
      friction: ballConfig.ballFriction || 0.005,
      frictionAir: ballConfig.ballFrictionAir || 0.001,
      label: 'gameBall'
    });
    World.add(world, gameBall);
    DYNAMIC_BODIES.push(gameBall);
    
    // Create goal
    const goalLocation = levelData.goalLocation;
    goal = Bodies.circle(goalLocation.x, goalLocation.y, ballConfig.goalRadius, {
      isStatic: true,
      isSensor: true,
      label: 'goal'
    });
    World.add(world, goal);
    
    // Create static objects
    if (levelData.objects) {
      levelData.objects.forEach(obj => {
        let body;
        
        if (obj.type === 'static') {
          if (obj.shape === 'rectangle') {
            body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
              isStatic: true,
              angle: obj.angle || 0,
              label: obj.id
            });
          } else if (obj.shape === 'circle') {
            body = Bodies.circle(obj.x, obj.y, obj.radius, {
              isStatic: true,
              label: obj.id
            });
    }
        } else if (obj.type === 'flipper') {
          // Create flipper as a dynamic body with constraint
          body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
            mass: 1,
            label: obj.id
          });
          
          const constraint = Constraint.create({
            pointA: obj.pivotPoint,
            bodyB: body,
            pointB: { x: 0, y: 0 },
            stiffness: 0.8,
            damping: 0.5
          });
          
          World.add(world, [body, constraint]);
          DYNAMIC_BODIES.push(body);
        } else if (obj.type === 'hoop') {
          // Create hoop as a sensor
          body = Bodies.circle(obj.x, obj.y, obj.radius, {
            isStatic: true,
            isSensor: true,
            label: obj.id
          });
        } else if (obj.type === 'switch') {
          // Create switch as a sensor
          body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
            isStatic: true,
            isSensor: true,
            label: obj.id
          });
        } else if (obj.type === 'gate') {
          // Create gate as a static body
          body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
            isStatic: true,
            label: obj.id
          });
        } else if (obj.type === 'gap') {
          // Create gap as a sensor (for visual purposes)
          body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
            isStatic: true,
            isSensor: true,
            label: obj.id
          });
        }
        
        if (body) {
          World.add(world, body);
          bodies.push({ body: body, renderHint: obj });
        }
      });
    }
    
    // Create grabbable objects
    if (levelData.grabbableObjects) {
      levelData.grabbableObjects.forEach(obj => {
        let body;
        
        if (obj.shape === 'rectangle') {
          body = Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
            mass: obj.mass || 1,
            restitution: 0.4,
            friction: 0.1,
            frictionAir: 0.001,
            label: obj.id
          });
        } else if (obj.shape === 'circle') {
          body = Bodies.circle(obj.x, obj.y, obj.radius, {
            mass: obj.mass || 1,
            restitution: 0.4,
            friction: 0.1,
            frictionAir: 0.001,
            label: obj.id
          });
        }
        
        if (body) {
          World.add(world, body);
          DYNAMIC_BODIES.push(body);
          grabbableBodies.set(obj.id, {
            body: body,
            respawnLocation: obj.respawnLocation,
            originalData: obj
          });
        }
      });
    }
    
    // Set up collision detection
    Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      
      for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;
        
        // Check for goal collision
        if ((bodyA.label === 'gameBall' && bodyB.label === 'goal') ||
            (bodyA.label === 'goal' && bodyB.label === 'gameBall')) {
          console.log('Goal reached! Level complete!');
          gameState = 'levelComplete';
          // Trigger level transition after a delay
          setTimeout(() => {
            if (gameState === 'levelComplete') {
              gameState = 'transitioning';
              loadLevel(currentLevel + 1);
            }
          }, 2000);
        }
        
        // Check for flipper activation
        if (bodyA.label === 'flipper' || bodyB.label === 'flipper') {
          const flipper = bodyA.label === 'flipper' ? bodyA : bodyB;
          const other = bodyA.label === 'flipper' ? bodyB : bodyA;
          
          if (other.label === 'gameBall') {
            // Activate flipper
            const flipperData = levelData.objects.find(obj => obj.id === flipper.label);
            if (flipperData && flipperData.power) {
              Body.setAngularVelocity(flipper, flipperData.power);
            }
          }
        }
          }
        });
  }
  
  // Load first level
  loadLevel(0);
  
  return { 
    engine, 
    world, 
    bodies, 
    DYNAMIC_BODIES, 
    grabbableBodies, 
    walls, 
    canvasSize, 
    sockets: new Set(),
    currentLevel,
    gameState,
    levelData,
    loadLevel
  };
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
    socket.emit('joinedPhysics', { clientSideOwnershipEnabled: false });
    
    // Send current level info
    socket.emit('levelInfo', {
      currentLevel: lobbyWorld.currentLevel,
      levelData: lobbyWorld.levelData,
      gameState: lobbyWorld.gameState
    });
  });

  socket.on('startDrag', ({ id, x, y }) => {
    if (!lobbyWorld) return;
    
    // Check if it's a grabbable object
    if (lobbyWorld.grabbableBodies.has(id)) {
      const entry = lobbyWorld.grabbableBodies.get(id);
      const body = entry.body;
    
      // Store drag data for this client
    const initialAngle = body.angle;
    socket.dragData = {
      body: body,
      initialAngle: initialAngle,
      offsetX: x - body.position.x,
      offsetY: y - body.position.y
    };
    
      console.log(`Client ${socket.id} started dragging grabbable object ${id}`);
    }
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
        console.log(`[throw] Applied velocity to ${body.label}: (${velocity.x.toFixed(1)}, ${velocity.y.toFixed(1)})`);
      } else {
        // No velocity or zero velocity - just stop the object
        const body = socket.dragData.body;
        Body.setVelocity(body, { x: 0, y: 0 });
        console.log(`[throw] No velocity applied to ${body.label}, stopped object`);
      }
      
      // Clear drag data
      socket.dragData = null;
    }
    console.log(`Client ${socket.id} stopped dragging`);
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

  socket.on('skipLevel', () => {
    if (!lobbyWorld) return;
    console.log(`Client ${socket.id} requested to skip level ${lobbyWorld.currentLevel + 1}`);
    
    // Trigger level transition immediately
    lobbyWorld.gameState = 'levelComplete';
    
    // Load next level after a short delay
    setTimeout(() => {
      if (lobbyWorld.gameState === 'levelComplete') {
        lobbyWorld.gameState = 'transitioning';
        lobbyWorld.loadLevel(lobbyWorld.currentLevel + 1);
      }
    }, 500);
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
    // Run physics simulation on all objects at 120fps for smoother ball physics
    Engine.update(lobbyWorld.engine, 1000 / 120);
    
    const floorY = lobbyWorld.canvasSize.height + WALL_THICKNESS / 2;
    
    // Check for objects that need respawning
    for (const [id, entry] of lobbyWorld.grabbableBodies) {
      const body = entry.body;
      const respawnLocation = entry.respawnLocation;
      
      // Respawn if object falls below screen
      if (body.position.y > floorY + RESPAWN_MARGIN) {
        console.log(`Respawning ${id} to original location`);
        Body.setPosition(body, { x: respawnLocation.x, y: respawnLocation.y });
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
        Body.setAngle(body, 0);
      }
    }
    
    // Respawn ball if it falls off screen
    if (lobbyWorld.gameBall && lobbyWorld.gameBall.position.y > floorY + RESPAWN_MARGIN) {
      const ballStart = lobbyWorld.levelData.ballStartLocation;
      console.log('Respawning ball to start location');
      Body.setPosition(lobbyWorld.gameBall, { x: ballStart.x, y: ballStart.y });
      Body.setVelocity(lobbyWorld.gameBall, { x: 0, y: 0 });
      Body.setAngularVelocity(lobbyWorld.gameBall, 0);
      }
    
    // Send state to clients
    io.to(lobbyCode).emit('state', {
      bodies: lobbyWorld.bodies.map(({ body, renderHint }) => ({
          id: body.label,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          image: renderHint.image,
          width: renderHint.width,
          height: renderHint.height,
        type: renderHint.type,
        isSensor: body.isSensor
      })),
      grabbableObjects: Array.from(lobbyWorld.grabbableBodies.entries()).map(([id, entry]) => ({
        id: id,
        x: entry.body.position.x,
        y: entry.body.position.y,
        angle: entry.body.angle,
        image: entry.originalData.image,
        width: entry.originalData.width,
        height: entry.originalData.height,
        type: 'grabbable'
      })),
      gameBall: lobbyWorld.gameBall ? {
        id: 'gameBall',
        x: lobbyWorld.gameBall.position.x,
        y: lobbyWorld.gameBall.position.y,
        angle: lobbyWorld.gameBall.angle,
        image: '/images/ball.png',
        width: 30,
        height: 30,
        type: 'ball'
      } : null,
      goal: lobbyWorld.goal ? {
        id: 'goal',
        x: lobbyWorld.goal.position.x,
        y: lobbyWorld.goal.position.y,
        image: '/images/goal.png',
        width: 50,
        height: 50,
        type: 'goal'
      } : null,
      currentLevel: lobbyWorld.currentLevel,
      gameState: lobbyWorld.gameState,
      levelData: lobbyWorld.levelData
    });
  }
  
  // Update global lobby
  if (globalLobby) {
    // Run physics simulation on all objects at 120fps for smoother ball physics
    Engine.update(globalLobby.engine, 1000 / 120);
    
    const floorY = globalLobby.canvasSize.height + WALL_THICKNESS / 2;
    
    // Check for objects that need respawning
    for (const [id, entry] of globalLobby.grabbableBodies) {
      const body = entry.body;
      const respawnLocation = entry.respawnLocation;
      
      // Respawn if object falls below screen
      if (body.position.y > floorY + RESPAWN_MARGIN) {
        console.log(`Respawning ${id} to original location`);
        Body.setPosition(body, { x: respawnLocation.x, y: respawnLocation.y });
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
        Body.setAngle(body, 0);
      }
    }
    
    // Respawn ball if it falls off screen
    if (globalLobby.gameBall && globalLobby.gameBall.position.y > floorY + RESPAWN_MARGIN) {
      const ballStart = globalLobby.levelData.ballStartLocation;
      console.log('Respawning ball to start location');
      Body.setPosition(globalLobby.gameBall, { x: ballStart.x, y: ballStart.y });
      Body.setVelocity(globalLobby.gameBall, { x: 0, y: 0 });
      Body.setAngularVelocity(globalLobby.gameBall, 0);
      }
    
    // Send state to clients
    io.to('GLOBAL').emit('state', {
      bodies: globalLobby.bodies.map(({ body, renderHint }) => ({
          id: body.label,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          image: renderHint.image,
          width: renderHint.width,
          height: renderHint.height,
        type: renderHint.type,
        isSensor: body.isSensor
      })),
      grabbableObjects: Array.from(globalLobby.grabbableBodies.entries()).map(([id, entry]) => ({
        id: id,
        x: entry.body.position.x,
        y: entry.body.position.y,
        angle: entry.body.angle,
        image: entry.originalData.image,
        width: entry.originalData.width,
        height: entry.originalData.height,
        type: 'grabbable'
      })),
      gameBall: globalLobby.gameBall ? {
        id: 'gameBall',
        x: globalLobby.gameBall.position.x,
        y: globalLobby.gameBall.position.y,
        angle: globalLobby.gameBall.angle,
        image: '/images/ball.png',
        width: 30,
        height: 30,
        type: 'ball'
      } : null,
      goal: globalLobby.goal ? {
        id: 'goal',
        x: globalLobby.goal.position.x,
        y: globalLobby.goal.position.y,
        image: '/images/goal.png',
        width: 50,
        height: 50,
        type: 'goal'
      } : null,
      currentLevel: globalLobby.currentLevel,
      gameState: globalLobby.gameState,
      levelData: globalLobby.levelData
    });
  }
}, 1000 / 120);

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