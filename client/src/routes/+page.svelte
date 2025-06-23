<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import io, { Socket } from 'socket.io-client';
  
  let currentView = 'main'; // main, join, create, lobby, username
  let joinType = ''; // public, private
  let lobbyCode = '';
  let playerName = '';
  let isPrivateLobby = false; // Add this for the toggle
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
    isPrivate: boolean;
  } | null = null;
  let currentLobby: {
    code: string;
    players: Array<{ id: string; name: string; isHost: boolean }>;
    maxPlayers: number;
    isPrivate: boolean;
  } | null = null;
  let isHost = false;
  let errorMessage = '';
  
  // New state variables for requested features
  let showUsernameEntry = false;
  let pendingLobbyCode = '';
  let showNotHostPopup = false;
  let showHostTransferPopup = false;
  let transferTargetPlayer: { id: string; name: string } | null = null;
  let hoveredPlayerId = '';
  
  console.log('🔧 [DEBUG] Component initialized with initial state:', {
    currentView,
    joinType,
    lobbyCode,
    playerName,
    publicLobbies: publicLobbies.length,
    createdLobby,
    currentLobby,
    isHost,
    errorMessage
  });
  
  onMount(() => {
    console.log('🚀 [DEBUG] Component mounted, setting up socket connection...');
    
    // Connect to lobby server
    const lobbyUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3081' 
      : `${window.location.protocol}//${window.location.host}`;
    
    const lobbyOptions = window.location.hostname === 'localhost' 
      ? {} 
      : { path: '/lobby-socket.io/' };
    
    console.log('🔌 [DEBUG] Connecting to lobby server:', { lobbyUrl, lobbyOptions });
    
    socket = io(lobbyUrl, lobbyOptions);
    
    socket.on('connect', () => {
      console.log('✅ [DEBUG] Connected to lobby server, socket ID:', socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('❌ [DEBUG] Disconnected from lobby server');
    });
    
    socket.on('connect_error', (error) => {
      console.error('🔥 [DEBUG] Socket connection error:', error);
    });
    
    socket.on('publicLobbies', (lobbies) => {
      console.log('📋 [DEBUG] Received public lobbies:', lobbies);
      publicLobbies = lobbies;
      console.log('📋 [DEBUG] Updated publicLobbies state:', publicLobbies);
    });
    
    socket.on('lobbyCreated', (lobby) => {
      console.log('🎉 [DEBUG] Lobby created successfully:', lobby);
      createdLobby = lobby;
      currentLobby = lobby;
      isHost = true;
      currentView = 'lobby';
      console.log('🎉 [DEBUG] Updated state after lobby creation:', {
        createdLobby,
        currentLobby,
        isHost,
        currentView
      });
    });
    
    socket.on('lobbyJoined', (lobby) => {
      console.log('🎯 [DEBUG] Successfully joined lobby:', lobby);
      currentLobby = lobby;
      isHost = false;
      currentView = 'lobby';
      console.log('🎯 [DEBUG] Updated state after joining lobby:', {
        currentLobby,
        isHost,
        currentView
      });
    });
    
    socket.on('joinError', (error) => {
      console.error('⚠️ [DEBUG] Join error received:', error);
      errorMessage = error;
      console.log('⚠️ [DEBUG] Set error message:', errorMessage);
      setTimeout(() => {
        console.log('🧹 [DEBUG] Clearing error message after timeout');
        errorMessage = '';
      }, 3000);
    });
    
    socket.on('playerJoined', ({ id, name, playerCount }) => {
      console.log('👤 [DEBUG] Player joined:', { id, name, playerCount });
      if (currentLobby) {
        console.log('👤 [DEBUG] Current lobby before adding player:', currentLobby);
        // Check if player already exists to avoid duplicates
        const existingPlayer = currentLobby.players.find(p => p.id === id);
        if (!existingPlayer) {
          currentLobby.players.push({ id, name, isHost: false });
          // Force reactivity by creating a new array reference
          currentLobby.players = [...currentLobby.players];
        }
        console.log('👤 [DEBUG] Current lobby after adding player:', currentLobby);
      } else {
        console.warn('⚠️ [DEBUG] No current lobby when player joined');
      }
    });
    
    socket.on('playerLeft', ({ id, playerCount, newHost }) => {
      console.log('👋 [DEBUG] Player left:', { id, playerCount, newHost });
      if (currentLobby) {
        console.log('👋 [DEBUG] Current lobby before removing player:', currentLobby);
        currentLobby.players = currentLobby.players.filter(p => p.id !== id);
        if (newHost) {
          // Update host status for all players
          currentLobby.players = currentLobby.players.map(p => ({
            ...p,
            isHost: p.id === newHost
          }));
          isHost = newHost === socket.id;
          console.log('👑 [DEBUG] Host changed, isHost now:', isHost);
        }
        // Force reactivity by creating a new array reference
        currentLobby.players = [...currentLobby.players];
        console.log('👋 [DEBUG] Current lobby after removing player:', currentLobby);
      } else {
        console.warn('⚠️ [DEBUG] No current lobby when player left');
      }
    });
    
    socket.on('gameStarting', ({ lobbyCode, players }) => {
      console.log('🎮 [DEBUG] Game starting:', { lobbyCode, players });
      console.log('🎮 [DEBUG] Redirecting to physics page...');
      // Redirect to physics page
      window.location.href = `/physics?lobby=${lobbyCode}`;
    });
    
    socket.on('hostTransferred', ({ newHostId, players }) => {
      console.log('👑 [DEBUG] Host transferred:', { newHostId, players });
      if (currentLobby) {
        currentLobby.players = players;
        isHost = newHostId === socket.id;
        console.log('👑 [DEBUG] Updated host status, isHost now:', isHost);
      }
    });
    
    socket.on('error', (error) => {
      console.error('🔥 [DEBUG] Socket error received:', error);
      errorMessage = error;
      console.log('🔥 [DEBUG] Set error message:', errorMessage);
      setTimeout(() => {
        console.log('🧹 [DEBUG] Clearing error message after timeout');
        errorMessage = '';
      }, 3000);
    });
    
    console.log('🔧 [DEBUG] All socket event listeners set up');
  });
  
  // Handle keyboard events for popups
  let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  
  $: if (showNotHostPopup || showHostTransferPopup) {
    // Remove existing handler if any
    if (keyboardHandler) {
      document.removeEventListener('keydown', keyboardHandler);
    }
    
    // Add new handler
    keyboardHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNotHostPopup) {
          closeNotHostPopup();
        } else if (showHostTransferPopup) {
          cancelHostTransfer();
        }
      }
    };
    
    document.addEventListener('keydown', keyboardHandler);
  } else {
    // Remove handler when no popups are shown
    if (keyboardHandler) {
      document.removeEventListener('keydown', keyboardHandler);
      keyboardHandler = null;
    }
  }
  
  onDestroy(() => {
    console.log('🛑 [DEBUG] Component destroying, disconnecting socket...');
    if (socket) {
      socket.disconnect();
      console.log('🛑 [DEBUG] Socket disconnected');
    }
    
    // Clean up keyboard handler
    if (keyboardHandler) {
      document.removeEventListener('keydown', keyboardHandler);
      keyboardHandler = null;
    }
  });
  
  function handleJoin() {
    console.log('🔍 [DEBUG] Join button clicked');
    currentView = 'join';
    console.log('🔍 [DEBUG] Changed view to join:', currentView);
  }
  
  function handleCreate() {
    console.log('✨ [DEBUG] Create button clicked');
    currentView = 'create';
    console.log('✨ [DEBUG] Changed view to create:', currentView);
  }
  
  function handleJoinPublic() {
    console.log('🌐 [DEBUG] Join public button clicked');
    joinType = 'public';
    console.log('🌐 [DEBUG] Set join type to public:', joinType);
  }
  
  function handleJoinPrivate() {
    console.log('🔒 [DEBUG] Join private button clicked');
    joinType = 'private';
    console.log('🔒 [DEBUG] Set join type to private:', joinType);
  }
  
  function handleBack() {
    console.log('⬅️ [DEBUG] Back button clicked, current view:', currentView);
    if (currentView === 'username') {
      console.log('⬅️ [DEBUG] Going back from username entry');
      currentView = 'main';
      showUsernameEntry = false;
      pendingLobbyCode = '';
      playerName = '';
      console.log('⬅️ [DEBUG] Reset username entry state');
    } else if (currentView === 'join' && joinType) {
      console.log('⬅️ [DEBUG] Going back from join type selection');
      joinType = '';
      console.log('⬅️ [DEBUG] Cleared join type:', joinType);
    } else if (currentView === 'join' || currentView === 'create') {
      console.log('⬅️ [DEBUG] Going back to main menu');
      currentView = 'main';
      console.log('⬅️ [DEBUG] Changed view to main:', currentView);
    } else if (currentView === 'lobby') {
      console.log('⬅️ [DEBUG] Leaving lobby');
      // Leave lobby
      if (socket) {
        console.log('⬅️ [DEBUG] Emitting disconnect event');
        socket.emit('disconnect');
      }
      currentView = 'main';
      createdLobby = null;
      currentLobby = null;
      isHost = false;
      console.log('⬅️ [DEBUG] Reset lobby state:', {
        currentView,
        createdLobby,
        currentLobby,
        isHost
      });
    }
  }
  
  function handleJoinLobby(lobbyCode: string) {
    console.log('🎯 [DEBUG] Joining lobby with code:', lobbyCode);
    
    if (!playerName.trim()) {
      // Show username entry screen
      showUsernameEntry = true;
      pendingLobbyCode = lobbyCode;
      currentView = 'username';
      return;
    }
    
    const joinData = { code: lobbyCode, playerName: playerName.trim() };
    console.log('🎯 [DEBUG] Emitting joinLobby with data:', joinData);
    socket.emit('joinLobby', joinData);
  }
  
  function handleJoinWithCode() {
    console.log('🔑 [DEBUG] Joining with code button clicked');
    console.log('🔑 [DEBUG] Lobby code input:', lobbyCode);
    console.log('🔑 [DEBUG] Player name input:', playerName);
    
    if (lobbyCode.trim()) {
      if (!playerName.trim()) {
        // Show username entry screen
        showUsernameEntry = true;
        pendingLobbyCode = lobbyCode.trim().toUpperCase();
        currentView = 'username';
        return;
      }
      
      const joinData = { 
        code: lobbyCode.trim().toUpperCase(), 
        playerName: playerName.trim() 
      };
      console.log('🔑 [DEBUG] Emitting joinLobby with data:', joinData);
      socket.emit('joinLobby', joinData);
    } else {
      console.warn('⚠️ [DEBUG] Cannot join: lobby code is empty');
    }
  }
  
  function handleCreateLobby() {
    console.log('✨ [DEBUG] Create lobby button clicked');
    console.log('✨ [DEBUG] Player name input:', playerName);
    
    if (!playerName.trim()) {
      // Show username entry screen for creating lobby
      showUsernameEntry = true;
      pendingLobbyCode = '';
      currentView = 'username';
      return;
    }
    
    const createData = { playerName: playerName.trim(), isPrivate: isPrivateLobby };
    console.log('✨ [DEBUG] Emitting createLobby with data:', createData);
    socket.emit('createLobby', createData);
  }
  
  function handleStartGame() {
    console.log('🎮 [DEBUG] Start game button clicked');
    console.log('🎮 [DEBUG] Is host:', isHost);
    console.log('🎮 [DEBUG] Current lobby:', currentLobby);
    
    if (!isHost) {
      showNotHostPopup = true;
      return;
    }
    
    if (socket && isHost) {
      console.log('🎮 [DEBUG] Emitting startGame event');
      socket.emit('startGame');
    } else {
      console.warn('⚠️ [DEBUG] Cannot start game - not host or no socket');
    }
  }
  
  function handleUsernameSubmit() {
    if (playerName.trim()) {
      showUsernameEntry = false;
      if (pendingLobbyCode) {
        // Joining an existing lobby
        const joinData = { code: pendingLobbyCode, playerName: playerName.trim() };
        socket.emit('joinLobby', joinData);
        pendingLobbyCode = '';
      } else {
        // Creating a new lobby
        const createData = { playerName: playerName.trim(), isPrivate: isPrivateLobby };
        socket.emit('createLobby', createData);
      }
    }
  }
  
  function handleHostTransfer(player: { id: string; name: string }) {
    transferTargetPlayer = player;
    showHostTransferPopup = true;
  }
  
  function confirmHostTransfer() {
    if (transferTargetPlayer && socket) {
      socket.emit('transferHost', { targetPlayerId: transferTargetPlayer.id });
      showHostTransferPopup = false;
      transferTargetPlayer = null;
    }
  }
  
  function cancelHostTransfer() {
    showHostTransferPopup = false;
    transferTargetPlayer = null;
  }
  
  function closeNotHostPopup() {
    showNotHostPopup = false;
  }
  
  function copyLobbyCode() {
    console.log('📋 [DEBUG] Copy lobby code button clicked');
    if (currentLobby) {
      console.log('📋 [DEBUG] Copying lobby code:', currentLobby.code);
      navigator.clipboard.writeText(currentLobby.code).then(() => {
        console.log('✅ [DEBUG] Lobby code copied to clipboard successfully!');
      }).catch(err => {
        console.error('❌ [DEBUG] Failed to copy lobby code:', err);
      });
    } else {
      console.warn('⚠️ [DEBUG] No current lobby to copy code from');
    }
  }
  
  function refreshPublicLobbies() {
    console.log('🔄 [DEBUG] Refresh public lobbies button clicked');
    console.log('🔄 [DEBUG] Emitting refreshPublicLobbies event');
    socket.emit('refreshPublicLobbies');
  }
  
  // Debug reactive statements
  $: {
    console.log('🔄 [DEBUG] Reactive update - currentView changed to:', currentView);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - joinType changed to:', joinType);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - lobbyCode changed to:', lobbyCode);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - playerName changed to:', playerName);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - publicLobbies count:', publicLobbies.length);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - currentLobby changed:', currentLobby);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - isHost changed to:', isHost);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - errorMessage changed to:', errorMessage);
  }
  
  $: {
    console.log('🔄 [DEBUG] Reactive update - isPrivateLobby changed to:', isPrivateLobby);
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
        <h1 class="title">Coop Puzzle Game</h1>
        <div class="subtitle">Find your puzzle buddies!</div>
      </div>
      
      <div class="menu-options">
        <button class="journal-button join-btn" on:click={handleJoin}>
          <span class="button-icon">Join</span>
          <span class="button-text">Join a Lobby</span>
        </button>
        
        <button class="journal-button create-btn" on:click={handleCreate}>
          <span class="button-icon">Create</span>
          <span class="button-text">Create a Lobby</span>
        </button>
      </div>
      
      <div class="decorative-elements">
        <div class="doodle doodle-1">Puzzle</div>
        <div class="doodle doodle-2">Game</div>
        <div class="doodle doodle-3">Fun</div>
        <div class="doodle doodle-4">Play</div>
        <div class="doodle doodle-5">Team</div>
        <div class="doodle doodle-6">Solve</div>
      </div>
    </div>
  {/if}
  
  <!-- Username Entry -->
  {#if currentView === 'username'}
    <div class="journal-page username-entry">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Enter Your Name</h2>
        <div class="subtitle">
          {#if pendingLobbyCode}
            Joining lobby {pendingLobbyCode}
          {:else}
            Creating a new lobby
          {/if}
        </div>
      </div>
      
      <div class="username-input-section">
        <label class="input-label" for="username-input">Your Name:</label>
        <input 
          id="username-input"
          type="text" 
          bind:value={playerName}
          placeholder="Enter your name"
          class="name-input"
          maxlength="20"
          on:keydown={(e) => e.key === 'Enter' && handleUsernameSubmit()}
        />
        <button class="username-submit-btn" on:click={handleUsernameSubmit} disabled={!playerName.trim()}>
          {#if pendingLobbyCode}
            Join Lobby
          {:else}
            Create Lobby
          {/if}
        </button>
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
          <span class="button-icon">Public</span>
          <span class="button-text">Public Lobbies</span>
          <span class="button-subtitle">Browse open games</span>
        </button>
        
        <button class="journal-button private-btn" on:click={handleJoinPrivate}>
          <span class="button-icon">Private</span>
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
                <span class="player-icon">Players</span>
              </div>
            </div>
            <button class="join-lobby-btn" on:click={() => handleJoinLobby(lobby.code)}>
              Join
            </button>
          </div>
        {/each}
      </div>
      
      <div class="refresh-section">
        <button class="refresh-btn" on:click={refreshPublicLobbies}>Refresh</button>
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
        <label class="input-label" for="private-player-name">Your Name:</label>
        <input 
          id="private-player-name"
          type="text" 
          bind:value={playerName}
          placeholder="Enter your name"
          class="name-input"
          maxlength="20"
        />
        <label class="input-label" for="private-lobby-code">Enter Lobby Code:</label>
        <input 
          id="private-lobby-code"
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
        <label class="input-label" for="create-player-name">Your Name:</label>
        <input 
          id="create-player-name"
          type="text" 
          bind:value={playerName}
          placeholder="Enter your name"
          class="name-input"
          maxlength="20"
        />
        
        <div class="privacy-toggle-section">
          <label class="input-label" for="privacy-toggle">Lobby Privacy:</label>
          <div class="toggle-container" id="privacy-toggle">
            <button 
              class="toggle-option {!isPrivateLobby ? 'active' : ''}" 
              on:click={() => isPrivateLobby = false}
            >
              <span class="toggle-icon">Public</span>
              <span class="toggle-text">Public</span>
              <span class="toggle-subtitle">Anyone can join</span>
            </button>
            <button 
              class="toggle-option {isPrivateLobby ? 'active' : ''}" 
              on:click={() => isPrivateLobby = true}
            >
              <span class="toggle-icon">Private</span>
              <span class="toggle-text">Private</span>
              <span class="toggle-subtitle">Code required</span>
            </button>
          </div>
        </div>
        
        <button class="create-lobby-btn" on:click={handleCreateLobby} disabled={!playerName.trim()}>
          Create {isPrivateLobby ? 'Private' : 'Public'} Lobby
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Lobby Room -->
  {#if currentView === 'lobby' && currentLobby}
    <div class="journal-page lobby-room dotted-background">
      <div class="page-header">
        <button class="back-button" on:click={handleBack}>← Back</button>
        <h2 class="title">Your Lobby</h2>
      </div>
      
      <div class="lobby-info-card">
        <div class="lobby-code-section">
          <h3>Lobby Code</h3>
          <div class="code-display">{currentLobby?.code}</div>
          <div class="lobby-privacy">
            <span class="privacy-badge {currentLobby?.isPrivate ? 'private' : 'public'}">
              {currentLobby?.isPrivate ? 'Private' : 'Public'}
            </span>
          </div>
          <button class="copy-btn" on:click={copyLobbyCode}>Copy</button>
        </div>
        
        <div class="players-section">
          <h3>Players ({currentLobby?.players?.length || 0}/{currentLobby?.maxPlayers || 4})</h3>
          <div class="players-list">
            {#if currentLobby?.players}
              {#each currentLobby.players as player}
                <div 
                  class="player-item {isHost && !player.isHost ? 'transferable' : ''}"
                  role="button"
                  tabindex="0"
                  aria-label="{isHost && !player.isHost ? `Transfer host to ${player.name}` : `Player ${player.name}`}"
                  on:click={() => isHost && !player.isHost && handleHostTransfer(player)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isHost && !player.isHost) {
                        handleHostTransfer(player);
                      }
                    }
                  }}
                  on:mouseenter={() => isHost && !player.isHost && (hoveredPlayerId = player.id)}
                  on:mouseleave={() => hoveredPlayerId = ''}
                >
                  <span class="player-icon">Player</span>
                  <span class="player-name">{player.name}</span>
                  {#if player.isHost}
                    <span class="host-badge">Host</span>
                  {/if}
                  {#if isHost && !player.isHost && hoveredPlayerId === player.id}
                    <div class="transfer-tooltip">Transfer Host</div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>
        
        <div class="lobby-actions">
          <button class="start-game-btn" on:click={handleStartGame} disabled={!isHost || (currentLobby?.players?.length || 0) < 2}>
            Start Game
          </button>
          <button class="physics-btn" on:click={() => window.location.href = `/physics?lobby=${currentLobby?.code}`}>
            Physics Engine
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Error Message -->
  {#if errorMessage}
    <div class="error-toast">
      <span class="error-text">Error: {errorMessage}</span>
    </div>
  {/if}
  
  <!-- Not Host Popup -->
  {#if showNotHostPopup}
    <div 
      class="popup-overlay" 
      role="dialog"
      tabindex="-1"
      aria-labelledby="not-host-title"
      aria-describedby="not-host-description"
      on:click={closeNotHostPopup}
    >
      <div 
        class="popup-content" 
        on:click|stopPropagation
      >
        <div class="popup-header">
          <h3 id="not-host-title">Not the Host</h3>
        </div>
        <div class="popup-body">
          <p id="not-host-description">Only the host can start the game. Ask the host to start the game or transfer host privileges to you.</p>
        </div>
        <div class="popup-actions">
          <button class="popup-btn cancel-btn" on:click={closeNotHostPopup}>OK</button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Host Transfer Confirmation Popup -->
  {#if showHostTransferPopup && transferTargetPlayer}
    <div 
      class="popup-overlay" 
      role="dialog"
      tabindex="-1"
      aria-labelledby="transfer-host-title"
      aria-describedby="transfer-host-description"
      on:click={cancelHostTransfer}
    >
      <div 
        class="popup-content" 
        on:click|stopPropagation
      >
        <div class="popup-header">
          <h3 id="transfer-host-title">Transfer Host</h3>
        </div>
        <div class="popup-body">
          <p id="transfer-host-description">Are you sure you want to transfer host privileges to <strong>{transferTargetPlayer.name}</strong>?</p>
          <p class="warning-text">This action cannot be undone.</p>
        </div>
        <div class="popup-actions">
          <button class="popup-btn cancel-btn" on:click={cancelHostTransfer}>Cancel</button>
          <button class="popup-btn confirm-btn" on:click={confirmHostTransfer}>Continue</button>
        </div>
      </div>
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
  
  .physics-btn {
    background: #9b59b6;
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 600;
    transition: all 0.3s ease;
    margin-top: 10px;
  }
  
  .physics-btn:hover {
    background: #8e44ad;
    transform: scale(1.05);
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
  
  .privacy-toggle-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
    align-items: center;
    width: 100%;
  }
  
  .toggle-container {
    display: flex;
    gap: 10px;
    width: 100%;
    max-width: 300px;
  }
  
  .toggle-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 15px 10px;
    border: 3px solid #ddd;
    border-radius: 12px;
    background: #fff;
    cursor: pointer;
    transition: all 0.3s ease;
    font-family: 'Comic Neue', cursive;
    position: relative;
    overflow: hidden;
    /* Add hand-drawn effect */
    box-shadow: 
      2px 2px 0 rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05);
  }
  
  .toggle-option::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    transition: left 0.5s;
  }
  
  .toggle-option:hover::before {
    left: 100%;
  }
  
  .toggle-option:hover {
    transform: translateY(-2px);
    box-shadow: 
      4px 4px 0 rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05),
      0 6px 20px rgba(0,0,0,0.1);
  }
  
  .toggle-option.active {
    border-color: #4ecdc4;
    background: #f0f9f8;
    color: #4ecdc4;
    font-weight: 600;
  }
  
  .toggle-option.active:hover {
    background: #4ecdc4;
    color: white;
  }
  
  .toggle-icon {
    font-size: 1.5rem;
  }
  
  .toggle-text {
    font-size: 1rem;
    font-weight: 600;
  }
  
  .toggle-subtitle {
    font-size: 0.8rem;
    opacity: 0.8;
    text-align: center;
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
  
  .lobby-privacy {
    margin-bottom: 15px;
  }
  
  .privacy-badge {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 15px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: 'Comic Neue', cursive;
  }
  
  .privacy-badge.public {
    background: #e3f2fd;
    color: #1976d2;
    border: 2px solid #bbdefb;
  }
  
  .privacy-badge.private {
    background: #fff3e0;
    color: #f57c00;
    border: 2px solid #ffcc02;
  }
  
  /* Dotted background for lobby */
  .dotted-background {
    background-image: radial-gradient(circle, #ddd 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: 0 0, 10px 10px;
  }
  
  /* Username entry styles */
  .username-input-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }
  
  .username-submit-btn {
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
  
  .username-submit-btn:hover:not(:disabled) {
    background: #3db8b0;
    transform: scale(1.05);
  }
  
  .username-submit-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  /* Popup styles */
  .popup-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  }
  
  .popup-content {
    background: white;
    border-radius: 15px;
    padding: 30px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }
  
  .popup-header {
    text-align: center;
    margin-bottom: 20px;
  }
  
  .popup-header h3 {
    font-size: 1.5rem;
    color: #333;
    margin: 0;
  }
  
  .popup-body {
    margin-bottom: 25px;
    text-align: center;
  }
  
  .popup-body p {
    margin: 0 0 15px 0;
    color: #666;
    line-height: 1.5;
  }
  
  .warning-text {
    color: #ff6b6b !important;
    font-weight: 600;
  }
  
  .popup-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
  }
  
  .popup-btn {
    padding: 12px 25px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
    font-family: 'Comic Neue', cursive;
  }
  
  .popup-btn.cancel-btn {
    background: #f0f0f0;
    color: #666;
  }
  
  .popup-btn.cancel-btn:hover {
    background: #e0e0e0;
  }
  
  .popup-btn.confirm-btn {
    background: #ff6b6b;
    color: white;
  }
  
  .popup-btn.confirm-btn:hover {
    background: #e55a5a;
  }
  
  /* Host transfer styles */
  .player-item.transferable {
    cursor: pointer;
    position: relative;
    transition: all 0.3s ease;
  }
  
  .player-item.transferable:hover {
    background: #f0f9f8;
    border-color: #4ecdc4;
    transform: translateY(-2px);
  }
  
  .player-item.transferable:focus {
    outline: 2px solid #4ecdc4;
    outline-offset: 2px;
    background: #f0f9f8;
    border-color: #4ecdc4;
  }
  
  .player-item[role="button"]:focus {
    outline: 2px solid #4ecdc4;
    outline-offset: 2px;
  }
  
  .transfer-tooltip {
    position: absolute;
    right: -120px;
    top: 50%;
    transform: translateY(-50%);
    background: #333;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    white-space: nowrap;
    z-index: 10;
    animation: fadeIn 0.2s ease;
  }
  
  .transfer-tooltip::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 50%;
    transform: translateY(-50%);
    border: 5px solid transparent;
    border-right-color: #333;
  }
  
  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
