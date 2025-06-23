# Physics Engine

A shared physics engine built with Svelte, Node.js, Matter.js, and Socket.IO.

## Features

- **1920x1080 Canvas**: Fixed resolution with aspect ratio scaling
- **Bullet Journal Style**: Paper texture background with grid lines and margins
- **Multiplayer Support**: Real-time collaboration with other players
- **Player Identification**: Each player gets a unique color hue and name display
- **Drag & Drop Physics**: Interactive objects that can be dragged and manipulated
- **Optimized Performance**: Reduced to 30 FPS for Raspberry Pi 4 compatibility
- **Responsive Design**: Scales to fit any screen size while maintaining aspect ratio

## How to Use

1. **Join a Lobby**: Create or join a lobby from the main page
2. **Access Physics Engine**: Click the "⚡ Physics Engine" button in the lobby
3. **Interact**: 
   - Move your mouse to see your cursor (with unique color)
   - Click and drag objects to move them
   - See other players' cursors and names
   - Watch real-time physics simulation

## Technical Details

### Performance Optimizations
- Frame rate limited to 30 FPS for Raspberry Pi 4
- Efficient sprite caching for images
- Optimized socket communication
- Reduced state update frequency

### Visual Features
- Bullet journal paper texture background
- Subtle grid lines for visual reference
- Margin lines for organization
- Player cursors with unique colors
- Player names displayed above cursors

### Physics Features
- Matter.js physics engine
- Real-time collision detection
- Drag constraints for smooth interaction
- Respawn system for objects that fall off screen
- Anchored objects with fixed points

## File Structure

```
client/src/routes/physics/
├── +page.svelte          # Main physics engine component
└── README.md             # This documentation
```

## Dependencies

- **Frontend**: Svelte, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO, Matter.js
- **Styling**: Tailwind CSS, Custom CSS

## Browser Support

- Modern browsers with WebSocket support
- Canvas 2D API support required
- ES6+ JavaScript features 