# Coop Puzzle Game - Client

A cooperative puzzle game with a beautiful bullet journal-style lobby system.

## Features

### 🎮 Lobby System
- **Main Menu**: Choose between joining or creating a lobby
- **Join Options**: 
  - Public lobbies: Browse and join open games
  - Private lobbies: Enter a code to join specific games
- **Create Lobby**: Generate a unique lobby code and manage players
- **Real-time Updates**: See player counts and lobby status

### 🎨 Design
- **Bullet Journal Style**: Hand-drawn aesthetic with cute doodles
- **Responsive Design**: Works on desktop and mobile devices
- **Smooth Animations**: Delightful hover effects and transitions
- **Colorful Theme**: Vibrant colors with a cohesive palette

### 🛠 Technical Features
- **TypeScript**: Full type safety
- **SvelteKit**: Modern web framework
- **Tailwind CSS**: Utility-first styling
- **Socket.IO**: Real-time communication (ready for backend integration)

## Getting Started

1. Install dependencies:
```bash
   npm install
   ```

2. Start the development server:
```bash
npm run dev
   ```

3. Open your browser to `http://localhost:5173`

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Type check
- `npm run format` - Format code

## Project Structure

```
src/
├── routes/
│   ├── +layout.svelte    # Global layout with fonts
│   ├── +page.svelte      # Main lobby interface
│   └── game/
│       ├── +page.svelte  # Game interface
│       └── +page.ts      # Game logic
├── app.css               # Global styles
└── app.html              # HTML template
```

## Lobby Flow

1. **Main Menu** → Choose "Join" or "Create"
2. **Join Path**:
   - Select "Public" to browse open lobbies
   - Select "Private" to enter a lobby code
3. **Create Path**:
   - Generate unique lobby code
   - Share code with friends
   - Start game when ready

## Future Enhancements

- [ ] Real-time lobby updates
- [ ] Player avatars and names
- [ ] Lobby chat functionality
- [ ] Game settings and customization
- [ ] Persistent user accounts
