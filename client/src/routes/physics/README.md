# Collaborative Puzzle Game

A shared puzzle game built with Svelte, Node.js, and Socket.IO.

## Features

- **1920x1080 Canvas**: Fixed resolution with aspect ratio scaling
- **Bullet Journal Style**: Paper texture background with grid lines and margins
- **Multiplayer Support**: Real-time collaboration with other players
- **Player Identification**: Each player gets a unique color hue and name display
- **Interactive Buttons**: Two buttons that can be pressed by different players
- **Light Bulb Puzzle**: Light bulb turns on when both buttons are pressed simultaneously
- **Optimized Performance**: Reduced to 30 FPS for Raspberry Pi 4 compatibility
- **Responsive Design**: Scales to fit any screen size while maintaining aspect ratio

## How to Use

1. **Join a Lobby**: Create or join a lobby from the main page
2. **Start the Game**: Click "Start Game" in the lobby (host only)
3. **Solve the Puzzle**: 
   - Move your mouse to see your cursor (with unique color)
   - Click and hold on Button 1
   - Have another player click and hold on Button 2
   - When both buttons are pressed, the light bulb will turn on
   - See other players' cursors and names in real-time

## Game Mechanics

### Button System
- **Button 1**: Can be pressed by any player
- **Button 2**: Can be pressed by any player
- **Light Bulb**: Turns on only when both buttons are pressed simultaneously
- **Collaboration Required**: Players must work together to solve the puzzle

### Visual Feedback
- Buttons change color when pressed (blue → red)
- Light bulb glows yellow when both buttons are active
- Player cursors show unique colors for easy identification
- Real-time status updates for all players

## Technical Details

### Performance Optimizations
- Frame rate limited to 30 FPS for Raspberry Pi 4
- Efficient canvas rendering
- Optimized socket communication
- Reduced state update frequency

### Visual Features
- Bullet journal paper texture background
- Subtle grid lines for visual reference
- Margin lines for organization
- Player cursors with unique colors
- Player names displayed above cursors
- Smooth button animations and visual feedback

### Game Features
- Real-time multiplayer interaction
- Button state synchronization
- Light bulb logic with visual effects
- Player tracking and identification
- Responsive canvas scaling

## File Structure

```
client/src/routes/physics/
├── +page.svelte          # Main puzzle game component
└── README.md             # This documentation
```

## Dependencies

- **Frontend**: Svelte, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO
- **Styling**: Tailwind CSS, Custom CSS

## Browser Support

- Modern browsers with WebSocket support
- Canvas 2D API support required
- ES6+ JavaScript features 