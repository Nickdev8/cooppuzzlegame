<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import io, { Socket } from 'socket.io-client';
  
  let currentView = 'main'; // main, join, create, lobby
  let joinType = ''; // public, private
  let lobbyCode = '';
  let playerName = '';
  let socket: Socket;
  let publicLobbies: Array<{
    code: string;
    playerCount: number;
    maxPlayers: number;
    createdAt: number;
  }> = [];
  let createdLobby: {
    code: string;
    players: Array<{ id: string; name: string; isHost: boolean }>;
    maxPlayers: number;
  } | null = null;
  let currentLobby: {
    code: string;
    players: Array<{ id: string; name: string; isHost: boolean }>;
    maxPlayers: number;
  } | null = null;
  let isHost = false;
  let errorMessage = '';
  
  onMount(() => {
    // Connect to lobby server
    const lobbyUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3081' 
      : `${window.location.protocol}//${window.location.host}/lobby-socket.io`;
    
    socket = io(lobbyUrl);
    
    socket.on('connect', () => {
      console.log('Connected to lobby server');
    });
    
    socket.on('publicLobbies', (lobbies) => {
      publicLobbies = lobbies;
    });
    
    socket.on('lobbyCreated', (lobby) => {
      createdLobby = lobby;
      currentLobby = lobby;
      isHost = true;
      currentView = 'lobby';
    });
    
    socket.on('lobbyJoined', (lobby) => {
      currentLobby = lobby;
      isHost = false;
      currentView = 'lobby';
    });
    
    socket.on('joinError', (error) => {
      errorMessage = error;
      setTimeout(() => {
        errorMessage = '';
      }, 3000);
    });
    
    socket.on('playerJoined', ({ id, name, playerCount }) => {
      if (currentLobby) {
        currentLobby.players.push({ id, name, isHost: false });
      }
    });
    
    socket.on('playerLeft', ({ id, playerCount, newHost }) => {
      if (currentLobby) {
        currentLobby.players = currentLobby.players.filter(p => p.id !== id);
        if (newHost) {
          isHost = newHost === socket.id;
        }
      }
    });
    
    socket.on('gameStarting', ({ lobbyCode, players }) => {
      // Redirect to game page
      window.location.href = `/game?lobby=${lobbyCode}`;
    });
    
    socket.on('error', (error) => {
      errorMessage = error;
      setTimeout(() => {
        errorMessage = '';
      }, 3000);
    });
  });
  
  onDestroy(() => {
    if (socket) {
      socket.disconnect();
    }
  });
  
  function handleJoin() {
    currentView = 'join';
  }
  
  function handleCreate() {
    currentView = 'create';
  }
  
  function handleJoinPublic() {
    joinType = 'public';
  }
  
  function handleJoinPrivate() {
    joinType = 'private';
  }
  
  function handleBack() {
    if (currentView === 'join' && joinType) {
      joinType = '';
    } else if (currentView === 'join' || currentView === 'create') {
      currentView = 'main';
    } else if (currentView === 'lobby') {
      // Leave lobby
      if (socket) {
        socket.emit('disconnect');
      }
      currentView = 'main';
      createdLobby = null;
      currentLobby = null;
      isHost = false;
    }
  }
  
  function handleJoinLobby(lobbyCode: string) {
    if (!playerName.trim()) {
      playerName = `Player${Math.floor(Math.random() * 1000)}`;
    }
    socket.emit('joinLobby', { code: lobbyCode, playerName: playerName.trim() });
  }
  
  function handleJoinWithCode() {
    if (lobbyCode.trim()) {
      if (!playerName.trim()) {
        playerName = `Player${Math.floor(Math.random() * 1000)}`;
      }
      socket.emit('joinLobby', { code: lobbyCode.trim().toUpperCase(), playerName: playerName.trim() });
    }
  }
  
  function handleCreateLobby() {
    if (!playerName.trim()) {
      playerName = `Player${Math.floor(Math.random() * 1000)}`;
    }
    socket.emit('createLobby', { playerName: playerName.trim(), isPrivate: false });
  }
  
  function handleStartGame() {
    if (socket && isHost) {
      socket.emit('startGame');
    }
  }
  
  function copyLobbyCode() {
    if (currentLobby) {
      navigator.clipboard.writeText(currentLobby.code).then(() => {
        console.log('Lobby code copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy lobby code:', err);
      });
    }
  }
  
  function refreshPublicLobbies() {
    socket.emit('refreshPublicLobbies');
  }
</script>

<svelte:head>
  <title>Coop Puzzle Game - Lobby</title>
</svelte:head>

<div class="journal-container">
  <!-- Main Menu -->
  {#if currentView === 'main'}
    <div class="journal-page main-menu">
      <div class="page-header">
        <h1 class="title">🎮 Coop Puzzle Game</h1>
        <div class="subtitle">Find your puzzle buddies!</div>
      </div>
      
      <div class="menu-options">
        <button class="journal-button join-btn" on:click={handleJoin}>
          <span class="button-icon">🔍</span>
          <span class="button-text">Join a Lobby</span>
        </button>
        
        <button class="journal-button create-btn" on:click={handleCreate}>
          <span class="button-icon">✨</span>
          <span class="button-text">Create a Lobby</span>
        </button>
      </div>
      
      <div class="decorative-elements">
        <div class="doodle doodle-1">🧩</div>
        <div class="doodle doodle-2">🎯</div>
        <div class="doodle doodle-3">🌟</div>
        <div class="doodle doodle-4">💡</div>
        <div class="doodle doodle-5">🎨</div>
        <div class="doodle doodle-6">📝</div>
      </div>
    </div>
  {/if}
  
  <!-- Join Options -->
  {#if currentView === 'join' && !joinType}
    <div class="journal-page join-options">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Join a Lobby</h2>
      </div>
      
      <div class="join-buttons">
        <button class="journal-button public-btn" on:click={handleJoinPublic}>
          <span class="button-icon">🌐</span>
          <span class="button-text">Public Lobbies</span>
          <span class="button-subtitle">Browse open games</span>
        </button>
        
        <button class="journal-button private-btn" on:click={handleJoinPrivate}>
          <span class="button-icon">🔒</span>
          <span class="button-text">Private Lobby</span>
          <span class="button-subtitle">Enter a code</span>
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Public Lobbies -->
  {#if currentView === 'join' && joinType === 'public'}
    <div class="journal-page public-lobbies">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Public Lobbies</h2>
      </div>
      
      <div class="lobby-list">
        {#each publicLobbies as lobby}
          <div class="lobby-card">
            <div class="lobby-info">
              <h3 class="lobby-name">Lobby {lobby.code}</h3>
              <div class="lobby-players">
                <span class="player-count">{lobby.playerCount}/{lobby.maxPlayers}</span>
                <span class="player-icon">👥</span>
              </div>
            </div>
            <button class="join-lobby-btn" on:click={() => handleJoinLobby(lobby.code)}>
              Join
            </button>
          </div>
        {/each}
      </div>
      
      <div class="refresh-section">
        <button class="refresh-btn" on:click={refreshPublicLobbies}>🔄 Refresh</button>
      </div>
    </div>
  {/if}
  
  <!-- Private Lobby -->
  {#if currentView === 'join' && joinType === 'private'}
    <div class="journal-page private-lobby">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Join Private Lobby</h2>
      </div>
      
      <div class="code-input-section">
        <label class="input-label">Your Name:</label>
        <input 
          type="text" 
          bind:value={playerName}
          placeholder="Enter your name"
          class="name-input"
          maxlength="20"
        />
        <label class="input-label">Enter Lobby Code:</label>
        <input 
          type="text" 
          bind:value={lobbyCode}
          placeholder="e.g., ABC123"
          class="code-input"
          maxlength="6"
        />
        <button class="join-code-btn" on:click={handleJoinWithCode} disabled={!lobbyCode.trim() || !playerName.trim()}>
          Join Lobby
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Create Lobby -->
  {#if currentView === 'create'}
    <div class="journal-page create-lobby">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Create a Lobby</h2>
      </div>
      
      <div class="name-input-section">
        <label class="input-label">Your Name:</label>
        <input 
          type="text" 
          bind:value={playerName}
          placeholder="Enter your name"
          class="name-input"
          maxlength="20"
        />
        <button class="create-lobby-btn" on:click={handleCreateLobby} disabled={!playerName.trim()}>
          ✨ Create Lobby
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Lobby Room -->
  {#if currentView === 'lobby' && currentLobby}
    <div class="journal-page lobby-room">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Your Lobby</h2>
      </div>
      
      <div class="lobby-info-card">
        <div class="lobby-code-section">
          <h3>Lobby Code</h3>
          <div class="code-display">{currentLobby?.code}</div>
          <button class="copy-btn" on:click={copyLobbyCode}>📋 Copy</button>
        </div>
        
        <div class="players-section">
          <h3>Players ({currentLobby?.players?.length || 0}/{currentLobby?.maxPlayers || 4})</h3>
          <div class="players-list">
            {#if currentLobby?.players}
              {#each currentLobby.players as player}
                <div class="player-item">
                  <span class="player-icon">👤</span>
                  <span class="player-name">{player.name}</span>
                  {#if player.isHost}
                    <span class="host-badge">Host</span>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>
        
        <div class="lobby-actions">
          <button class="start-game-btn" on:click={handleStartGame} disabled={!isHost || (currentLobby?.players?.length || 0) < 2}>
            🎮 Start Game
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Error Message -->
  {#if errorMessage}
    <div class="error-toast">
      <span class="error-text">⚠️ {errorMessage}</span>
    </div>
  {/if}
</div>

<style>
  .journal-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    font-family: 'Comic Neue', cursive;
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .journal-page {
    background: #fff;
    border-radius: 20px;
    padding: 40px;
    box-shadow: 
      0 10px 30px rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05);
    max-width: 500px;
    width: 100%;
    position: relative;
    overflow: hidden;
    /* Add subtle paper texture */
    background-image: 
      radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.03) 0%, transparent 50%);
  }
  
  .journal-page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4);
  }
  
  /* Add hand-drawn border effect */
  .journal-page::after {
    content: '';
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    bottom: 8px;
    border: 2px solid rgba(0,0,0,0.1);
    border-radius: 15px;
    pointer-events: none;
  }
  
  .page-header {
    text-align: center;
    margin-bottom: 40px;
    position: relative;
  }
  
  .back-button {
    position: absolute;
    left: 0;
    top: 0;
    background: none;
    border: 2px solid #ddd;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.3s ease;
  }
  
  .back-button:hover {
    background: #f0f0f0;
    border-color: #bbb;
  }
  
  .title {
    font-family: 'Indie Flower', cursive;
    font-size: 2.5rem;
    color: #333;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
  }
  
  .subtitle {
    font-size: 1.1rem;
    color: #666;
    font-style: italic;
  }
  
  .menu-options {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 30px;
  }
  
  .journal-button {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 20px 25px;
    border: 3px solid #333;
    border-radius: 15px;
    background: #fff;
    cursor: pointer;
    transition: all 0.3s ease;
    font-family: 'Comic Neue', cursive;
    font-size: 1.1rem;
    font-weight: 600;
    position: relative;
    overflow: hidden;
    /* Add hand-drawn effect */
    box-shadow: 
      3px 3px 0 rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05);
  }
  
  .journal-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    transition: left 0.5s;
  }
  
  .journal-button:hover::before {
    left: 100%;
  }
  
  .journal-button:hover {
    transform: translateY(-2px);
    box-shadow: 
      5px 5px 0 rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05),
      0 8px 25px rgba(0,0,0,0.15);
  }
  
  /* Add subtle hand-drawn border variation */
  .journal-button::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 17px;
    pointer-events: none;
  }
  
  .join-btn {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  
  .join-btn:hover {
    background: #4ecdc4;
    color: white;
  }
  
  .create-btn {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }
  
  .create-btn:hover {
    background: #ff6b6b;
    color: white;
  }
  
  .public-btn {
    border-color: #45b7d1;
    color: #45b7d1;
  }
  
  .public-btn:hover {
    background: #45b7d1;
    color: white;
  }
  
  .private-btn {
    border-color: #96ceb4;
    color: #96ceb4;
  }
  
  .private-btn:hover {
    background: #96ceb4;
    color: white;
  }
  
  .button-icon {
    font-size: 1.5rem;
  }
  
  .button-text {
    flex: 1;
    text-align: left;
  }
  
  .button-subtitle {
    font-size: 0.9rem;
    font-weight: 400;
    opacity: 0.8;
  }
  
  .join-buttons {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .lobby-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 30px;
  }
  
  .lobby-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border: 2px solid #ddd;
    border-radius: 12px;
    background: #fafafa;
    transition: all 0.3s ease;
  }
  
  .lobby-card:hover {
    border-color: #4ecdc4;
    background: #f0f9f8;
  }
  
  .lobby-info {
    flex: 1;
  }
  
  .lobby-name {
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 5px;
  }
  
  .lobby-players {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #666;
  }
  
  .player-count {
    font-weight: 600;
  }
  
  .join-lobby-btn {
    background: #4ecdc4;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .join-lobby-btn:hover {
    background: #3db8b0;
    transform: scale(1.05);
  }
  
  .refresh-section {
    text-align: center;
  }
  
  .refresh-btn {
    background: none;
    border: 2px solid #ddd;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-family: 'Comic Neue', cursive;
    transition: all 0.3s ease;
  }
  
  .refresh-btn:hover {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  
  .code-input-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }
  
  .input-label {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
  }
  
  .code-input {
    width: 200px;
    padding: 15px;
    border: 3px solid #ddd;
    border-radius: 10px;
    font-size: 1.2rem;
    font-family: 'Comic Neue', cursive;
    text-align: center;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  
  .code-input:focus {
    outline: none;
    border-color: #4ecdc4;
  }
  
  .join-code-btn {
    background: #4ecdc4;
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .join-code-btn:hover:not(:disabled) {
    background: #3db8b0;
    transform: scale(1.05);
  }
  
  .join-code-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .lobby-info-card {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }
  
  .lobby-code-section {
    text-align: center;
    padding: 25px;
    border: 3px solid #ff6b6b;
    border-radius: 15px;
    background: #fff5f5;
  }
  
  .lobby-code-section h3 {
    font-size: 1.2rem;
    color: #333;
    margin-bottom: 15px;
  }
  
  .code-display {
    font-size: 2rem;
    font-weight: 700;
    color: #ff6b6b;
    letter-spacing: 3px;
    margin-bottom: 15px;
    font-family: 'Courier New', monospace;
  }
  
  .copy-btn {
    background: #ff6b6b;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .copy-btn:hover {
    background: #e55a5a;
    transform: scale(1.05);
  }
  
  .players-section {
    padding: 25px;
    border: 3px solid #4ecdc4;
    border-radius: 15px;
    background: #f0f9f8;
  }
  
  .players-section h3 {
    font-size: 1.2rem;
    color: #333;
    margin-bottom: 15px;
    text-align: center;
  }
  
  .players-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .player-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: white;
    border-radius: 8px;
    border: 1px solid #ddd;
  }
  
  .player-icon {
    font-size: 1.2rem;
  }
  
  .player-name {
    flex: 1;
    font-weight: 600;
  }
  
  .host-badge {
    background: #ff6b6b;
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  
  .lobby-actions {
    text-align: center;
  }
  
  .start-game-btn {
    background: #4ecdc4;
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .start-game-btn:hover:not(:disabled) {
    background: #3db8b0;
    transform: scale(1.05);
  }
  
  .start-game-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .decorative-elements {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }
  
  .doodle {
    position: absolute;
    font-size: 2rem;
    opacity: 0.1;
    animation: float 3s ease-in-out infinite;
  }
  
  .doodle-1 {
    top: 20%;
    right: 10%;
    animation-delay: 0s;
  }
  
  .doodle-2 {
    bottom: 30%;
    left: 5%;
    animation-delay: 1s;
  }
  
  .doodle-3 {
    top: 60%;
    right: 5%;
    animation-delay: 2s;
  }
  
  .doodle-4 {
    top: 40%;
    left: 10%;
    animation-delay: 3s;
  }
  
  .doodle-5 {
    bottom: 10%;
    right: 10%;
    animation-delay: 4s;
  }
  
  .doodle-6 {
    top: 80%;
    left: 20%;
    animation-delay: 5s;
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }
  
  @media (max-width: 600px) {
    .journal-container {
      padding: 10px;
    }
    
    .journal-page {
      padding: 20px;
    }
    
    .title {
      font-size: 2rem;
    }
    
    .code-input {
      width: 150px;
    }
  }
  
  .name-input-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }
  
  .name-input {
    width: 250px;
    padding: 15px;
    border: 3px solid #ddd;
    border-radius: 10px;
    font-size: 1.1rem;
    font-family: 'Comic Neue', cursive;
    text-align: center;
  }
  
  .name-input:focus {
    outline: none;
    border-color: #ff6b6b;
  }
  
  .create-lobby-btn {
    background: #ff6b6b;
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .create-lobby-btn:hover:not(:disabled) {
    background: #e55a5a;
    transform: scale(1.05);
  }
  
  .create-lobby-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .error-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 1000;
    animation: slideIn 0.3s ease;
  }
  
  .error-text {
    font-weight: 600;
  }
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
</style>
