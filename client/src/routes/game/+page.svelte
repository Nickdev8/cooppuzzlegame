<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	let lobbyCode: string | null = null;
	let gameContainer: HTMLDivElement;
	let godotGame: HTMLIFrameElement;
	let loadingMessage = 'Loading Godot game...';
	let errorMessage = '';
	let isGameLoaded = false;

	onMount(() => {
		// Get lobby code from URL parameters
		const urlParams = new URLSearchParams(window.location.search);
		lobbyCode = urlParams.get('lobby');
		
		if (!lobbyCode) {
			errorMessage = 'No lobby code provided. Please return to the lobby.';
			return;
		}

		// Load the Godot game
		loadGodotGame();
	});

	function loadGodotGame() {
		if (!gameContainer) return;

		// Create iframe for Godot game
		godotGame = document.createElement('iframe');
		godotGame.src = '/godot-game/index.html';
		godotGame.style.width = '100%';
		godotGame.style.height = '100%';
		godotGame.style.border = 'none';
		godotGame.style.background = '#000';

		// Listen for game load
		godotGame.onload = () => {
			isGameLoaded = true;
			loadingMessage = 'Game loaded! Connecting to server...';
			console.log('Godot game iframe loaded successfully');
			
			// Pass lobby information to Godot game
			setTimeout(() => {
				if (godotGame.contentWindow) {
					// Use the correct WebSocket URL based on environment
					let serverUrl;
					if (window.location.hostname === 'localhost') {
						serverUrl = 'ws://localhost:9001';
					} else {
						// For production, use the WebSocket server
						serverUrl = `wss://${window.location.hostname}:9001`;
					}
					
					const lobbyInfo = {
						type: 'LOBBY_INFO',
						lobbyCode: lobbyCode,
						serverUrl: serverUrl
					};
					
					console.log('Sending lobby info to Godot game:', lobbyInfo);
					godotGame.contentWindow.postMessage(lobbyInfo, '*');
				} else {
					console.error('Godot game contentWindow is not available');
				}
			}, 1000);
		};

		godotGame.onerror = (error) => {
			console.error('Failed to load Godot game:', error);
			errorMessage = 'Failed to load Godot game. Please check if the game files are available.';
		};

		gameContainer.appendChild(godotGame);
	}

	function goBackToLobby() {
		window.location.href = '/';
	}
</script>

<svelte:head>
	<title>Cooperative Puzzle Game</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
			background: #000;
		}
	</style>
</svelte:head>

<div class="game-container">
	{#if errorMessage}
		<div class="error-overlay">
			<div class="error-content">
				<h2>Error</h2>
				<p>{errorMessage}</p>
				<button on:click={goBackToLobby}>Return to Lobby</button>
			</div>
		</div>
	{:else if !isGameLoaded}
		<div class="loading-overlay">
			<div class="loading-content">
				<div class="spinner"></div>
				<p>{loadingMessage}</p>
				<p class="lobby-info">Lobby: {lobbyCode}</p>
			</div>
		</div>
	{/if}
	
	<div bind:this={gameContainer} class="godot-game-container"></div>
</div>

<style>
	.game-container {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: #000;
	}

	.loading-overlay,
	.error-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.loading-content,
	.error-content {
		text-align: center;
		color: white;
		font-family: Arial, sans-serif;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 3px solid #333;
		border-top: 3px solid #fff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 20px;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.lobby-info {
		font-size: 14px;
		color: #ccc;
		margin-top: 10px;
	}

	button {
		background: #4CAF50;
		color: white;
		border: none;
		padding: 10px 20px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 16px;
		margin-top: 20px;
	}

	button:hover {
		background: #45a049;
	}

	.godot-game-container {
		width: 100%;
		height: 100%;
	}
</style>