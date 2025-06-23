<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

	let lobbyCode: string | null = null;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let socket: Socket;

	let cursorImg: HTMLImageElement;
	const cursorSize = 32;

	interface CursorHuesMap {
		[id: string]: number;
	}
	const cursorHues: CursorHuesMap = {};

	interface MousePosition {
		x: number;
		y: number;
	}
	interface MousePositionsMap {
		[id: string]: MousePosition;
	}
	let mousePositions: MousePositionsMap = {};

	interface PlayerInfo {
		id: string;
		name: string;
		x: number;
		y: number;
		hue: number;
	}

	let players: PlayerInfo[] = [];

	let canvasWidth = 1920;
	let canvasHeight = 1080;

	// Game state
	let button1Pressed = false;
	let button2Pressed = false;
	let lightBulbOn = false;
	let button1PressedBy: string[] = [];
	let button2PressedBy: string[] = [];

	// Physics objects
	let button1 = { x: 400, y: 600, width: 120, height: 80, radius: 60 };
	let button2 = { x: 800, y: 600, width: 120, height: 80, radius: 60 };
	let lightBulb = { x: 600, y: 300, width: 100, height: 100, radius: 50 };

	let lastDrawTime = 0;
	const targetFPS = 30;
	const frameInterval = 1000 / targetFPS;
	let animationFrameId: number;

	const log = (...args: any[]) => console.log(...args);

	function handleWindowMousemove(e: MouseEvent): void {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const x = (e.clientX - rect.left) * scaleX;
		const y = (e.clientY - rect.top) * scaleY;

		try {
			if (x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height) {
				socket.emit('movemouse', { x, y });
			} else {
				socket.emit('mouseLeave');
			}
		} catch (err) {
			console.error('[handleWindowMousemove] emit error:', err);
		}
	}

	function handleWindowMouseleave(): void {
		socket.emit('mouseLeave');
	}

	function handleCanvasMousedown(e: MouseEvent): void {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;

		// Check if clicking on button 1
		const dx1 = mx - button1.x;
		const dy1 = my - button1.y;
		if (dx1 * dx1 + dy1 * dy1 <= button1.radius * button1.radius) {
			if (socket.id && !button1PressedBy.includes(socket.id)) {
				button1PressedBy.push(socket.id);
				button1Pressed = button1PressedBy.length > 0;
				socket.emit('buttonPress', { button: 1, pressed: true, playerId: socket.id });
			}
		}

		// Check if clicking on button 2
		const dx2 = mx - button2.x;
		const dy2 = my - button2.y;
		if (dx2 * dx2 + dy2 * dy2 <= button2.radius * button2.radius) {
			if (socket.id && !button2PressedBy.includes(socket.id)) {
				button2PressedBy.push(socket.id);
				button2Pressed = button2PressedBy.length > 0;
				socket.emit('buttonPress', { button: 2, pressed: true, playerId: socket.id });
			}
		}
	}

	function handleCanvasMouseup(e: MouseEvent): void {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;

		// Check if releasing button 1
		const dx1 = mx - button1.x;
		const dy1 = my - button1.y;
		if (dx1 * dx1 + dy1 * dy1 <= button1.radius * button1.radius) {
			if (socket.id) {
				button1PressedBy = button1PressedBy.filter(id => id !== socket.id);
				button1Pressed = button1PressedBy.length > 0;
				socket.emit('buttonPress', { button: 1, pressed: false, playerId: socket.id });
			}
		}

		// Check if releasing button 2
		const dx2 = mx - button2.x;
		const dy2 = my - button2.y;
		if (dx2 * dx2 + dy2 * dy2 <= button2.radius * button2.radius) {
			if (socket.id) {
				button2PressedBy = button2PressedBy.filter(id => id !== socket.id);
				button2Pressed = button2PressedBy.length > 0;
				socket.emit('buttonPress', { button: 2, pressed: false, playerId: socket.id });
			}
		}
	}

	function draw(): void {
		const now = performance.now();
		if (now - lastDrawTime < frameInterval) {
			animationFrameId = requestAnimationFrame(draw);
			return;
		}
		lastDrawTime = now;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Draw bullet journal style background
		drawBulletJournalBackground();

		// Draw title
		ctx.save();
		ctx.fillStyle = '#2c3e50';
		ctx.font = 'bold 48px "Comic Neue", cursive';
		ctx.textAlign = 'center';
		ctx.fillText('Collaborative Puzzle', canvas.width / 2, 120);
		ctx.font = '24px "Comic Neue", cursive';
		ctx.fillStyle = '#7f8c8d';
		ctx.fillText('Press both buttons together to light the bulb', canvas.width / 2, 160);
		ctx.restore();

		// Draw button 1
		drawButton(button1, button1Pressed, 'Button 1');

		// Draw button 2
		drawButton(button2, button2Pressed, 'Button 2');

		// Draw light bulb
		drawLightBulb(lightBulb, lightBulbOn);

		// Draw other players' cursors with names
		for (const clientId in mousePositions) {
			const pos = mousePositions[clientId]!;
			const hue = cursorHues[clientId]!;
			const player = players.find(p => p.id === clientId);

			ctx.save();
			ctx.filter = `hue-rotate(${hue}deg)`;
			ctx.drawImage(
				cursorImg,
				pos.x - cursorSize / 2,
				pos.y - cursorSize / 2,
				cursorSize,
				cursorSize
			);
			ctx.restore();

			// Draw player name above cursor
			if (player) {
				ctx.save();
				ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
				ctx.font = 'bold 16px "Comic Neue", cursive';
				ctx.textAlign = 'center';
				ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
				ctx.shadowBlur = 4;
				ctx.shadowOffsetX = 1;
				ctx.shadowOffsetY = 1;
				ctx.fillText(player.name, pos.x, pos.y - cursorSize - 10);
				ctx.restore();
			}
		}

		ctx.filter = 'none';

		animationFrameId = requestAnimationFrame(draw);
	}

	function drawBulletJournalBackground(): void {
		// Draw paper texture background
		ctx.fillStyle = '#f8f6f1';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw subtle grid lines
		ctx.strokeStyle = '#e8e4d9';
		ctx.lineWidth = 1;
		const gridSize = 50;

		for (let x = 0; x <= canvas.width; x += gridSize) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}

		for (let y = 0; y <= canvas.height; y += gridSize) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvas.width, y);
			ctx.stroke();
		}

		// Draw margin lines
		ctx.strokeStyle = '#d4c4a8';
		ctx.lineWidth = 2;
		const margin = 100;

		// Left margin
		ctx.beginPath();
		ctx.moveTo(margin, 0);
		ctx.lineTo(margin, canvas.height);
		ctx.stroke();

		// Top margin
		ctx.beginPath();
		ctx.moveTo(0, margin);
		ctx.lineTo(canvas.width, margin);
		ctx.stroke();
	}

	function drawButton(button: any, pressed: boolean, label: string): void {
		ctx.save();
		
		// Button shadow
		ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
		ctx.beginPath();
		ctx.arc(button.x + 4, button.y + 4, button.radius, 0, Math.PI * 2);
		ctx.fill();

		// Button body
		const gradient = ctx.createRadialGradient(
			button.x - 20, button.y - 20, 0,
			button.x, button.y, button.radius
		);
		
		if (pressed) {
			gradient.addColorStop(0, '#e74c3c');
			gradient.addColorStop(1, '#c0392b');
		} else {
			gradient.addColorStop(0, '#3498db');
			gradient.addColorStop(1, '#2980b9');
		}
		
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
		ctx.fill();

		// Button border
		ctx.strokeStyle = '#2c3e50';
		ctx.lineWidth = 3;
		ctx.stroke();

		// Button label
		ctx.fillStyle = 'white';
		ctx.font = 'bold 18px "Comic Neue", cursive';
		ctx.textAlign = 'center';
		ctx.fillText(label, button.x, button.y + 6);

		ctx.restore();
	}

	function drawLightBulb(bulb: any, on: boolean): void {
		ctx.save();

		// Bulb shadow
		ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
		ctx.beginPath();
		ctx.arc(bulb.x + 4, bulb.y + 4, bulb.radius, 0, Math.PI * 2);
		ctx.fill();

		// Bulb glow when on
		if (on) {
			const glowGradient = ctx.createRadialGradient(
				bulb.x, bulb.y, 0,
				bulb.x, bulb.y, bulb.radius * 2
			);
			glowGradient.addColorStop(0, 'rgba(255, 255, 0, 0.3)');
			glowGradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
			ctx.fillStyle = glowGradient;
			ctx.beginPath();
			ctx.arc(bulb.x, bulb.y, bulb.radius * 2, 0, Math.PI * 2);
			ctx.fill();
		}

		// Bulb body
		const bulbGradient = ctx.createRadialGradient(
			bulb.x - 15, bulb.y - 15, 0,
			bulb.x, bulb.y, bulb.radius
		);
		
		if (on) {
			bulbGradient.addColorStop(0, '#f1c40f');
			bulbGradient.addColorStop(1, '#f39c12');
		} else {
			bulbGradient.addColorStop(0, '#bdc3c7');
			bulbGradient.addColorStop(1, '#95a5a6');
		}
		
		ctx.fillStyle = bulbGradient;
		ctx.beginPath();
		ctx.arc(bulb.x, bulb.y, bulb.radius, 0, Math.PI * 2);
		ctx.fill();

		// Bulb border
		ctx.strokeStyle = '#2c3e50';
		ctx.lineWidth = 3;
		ctx.stroke();

		// Bulb filament
		ctx.strokeStyle = '#2c3e50';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(bulb.x - 15, bulb.y);
		ctx.lineTo(bulb.x + 15, bulb.y);
		ctx.moveTo(bulb.x, bulb.y - 15);
		ctx.lineTo(bulb.x, bulb.y + 15);
		ctx.stroke();

		// Bulb base
		ctx.fillStyle = '#34495e';
		ctx.beginPath();
		ctx.rect(bulb.x - 20, bulb.y + bulb.radius - 5, 40, 15);
		ctx.fill();

		// Status text
		ctx.fillStyle = on ? '#27ae60' : '#7f8c8d';
		ctx.font = 'bold 20px "Comic Neue", cursive';
		ctx.textAlign = 'center';
		ctx.fillText(on ? 'ON' : 'OFF', bulb.x, bulb.y + bulb.radius + 40);

		ctx.restore();
	}

	onMount(() => {
		log('[onMount] initializing puzzle game');

		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		canvas.style.width = '100%';
		canvas.style.height = 'auto';

		cursorImg = new Image();
		cursorImg.src = '/images/cursor.svg';
		cursorImg.onload = () => {
			console.log('Cursor SVG loaded');
			draw();
		};

		if (!canvas) {
			console.error('[onMount] canvas ref not set!');
			return;
		}
		ctx = canvas.getContext('2d')!;
		
		// Extract lobby code from URL
		const urlParams = new URLSearchParams(window.location.search);
		const lobbyCodeParam = urlParams.get('lobby');
		
		if (!lobbyCodeParam) {
			console.error('[onMount] No lobby code found in URL!');
			alert('No lobby code found. Please join a lobby first.');
			window.location.href = '/';
			return;
		}
		
		// Set lobby code and update page title
		lobbyCode = lobbyCodeParam;
		document.title = `Collaborative Puzzle - Lobby ${lobbyCode}`;
		
		console.log('[onMount] Joining puzzle game for lobby:', lobbyCode);
		
		// Connect to game server
		const gameUrl = window.location.hostname === 'localhost' 
			? 'http://localhost:3080' 
			: `${window.location.protocol}//${window.location.host}`;
		
		const gameOptions = window.location.hostname === 'localhost' 
			? {} 
			: { path: '/game-socket.io/' };
		
		socket = io(gameUrl, { 
			transports: ['websocket'], 
			timeout: 10000,
			...gameOptions
		});

		socket.on('connect', () => {
			const localId = socket.id!;
			cursorHues[localId] = Math.floor(Math.random() * 360);
			console.log('Local hue for', localId, ':', cursorHues[localId]);
			
			// Join the specific game room for this lobby
			socket.emit('joinGame', { lobbyCode });
			console.log('Joined puzzle game for lobby:', lobbyCode);
		});

		socket.on('connect_error', (err) => console.error('[socket] connect_error:', err));
		socket.on('disconnect', (reason) => console.warn('[socket] disconnect:', reason));

		// Handle player updates
		socket.on('players', (payload: PlayerInfo[]) => {
			players = payload;
		});

		// Handle button press updates
		socket.on('buttonState', (payload: { button1Pressed: boolean, button2Pressed: boolean, lightBulbOn: boolean }) => {
			button1Pressed = payload.button1Pressed;
			button2Pressed = payload.button2Pressed;
			lightBulbOn = payload.lightBulbOn;
		});

		socket.on('mouseMoved', (payload: { id: string; x: number; y: number }) => {
			const { id, x, y } = payload;

			if (id === socket.id) {
				return;
			}

			mousePositions[id] = { x, y };

			if (cursorHues[id] === undefined) {
				cursorHues[id] = Math.floor(Math.random() * 360);
				console.log('Assigned hue for', id, ':', cursorHues[id]);
			}
		});

		socket.on('mouseRemoved', ({ id }: { id: string }) => {
			log('[socket] mouseRemoved', id);
			delete mousePositions[id];
		});

		window.addEventListener('mousemove', handleWindowMousemove);
		window.addEventListener('mouseleave', handleWindowMouseleave);
	});

	onDestroy(() => {
		log('[onDestroy] cleaning up');
		window.removeEventListener('mousemove', handleWindowMousemove);
		window.removeEventListener('mouseleave', handleWindowMouseleave);
		
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
		
		socket.disconnect();
	});
</script>

<div class="puzzle-container">
	<canvas
		bind:this={canvas}
		width={canvasWidth}
		height={canvasHeight}
		style="cursor:url('/images/cursor.svg') 14 8, auto"
		on:mousedown={handleCanvasMousedown}
		on:mouseup={handleCanvasMouseup}
	></canvas>
	
	{#if lobbyCode}
		<div class="lobby-indicator">
			<div class="lobby-header">
				<span class="lobby-text">Collaborative Puzzle</span>
			</div>
			<div class="lobby-code">Lobby: {lobbyCode}</div>
		</div>
		
		<div class="player-list">
			<div class="player-list-header">
				<span>Players ({players.length})</span>
			</div>
			{#each players as player}
				<div class="player-item" style="--player-hue: {player.hue}">
					<div class="player-color-dot"></div>
					<span class="player-name">{player.name}</span>
				</div>
			{/each}
		</div>
		
		<button class="back-to-lobby-btn" on:click={() => window.location.href = '/'}>
			Back to Lobby
		</button>
	{/if}
</div>

<style>
	.puzzle-container {
		height: calc(var(--vh) * 100);
		width: 100vw;
		position: relative;
		overflow: hidden;
		background: linear-gradient(135deg, #f8f6f1 0%, #e8e4d9 100%);
	}

	canvas {
		background-color: #f8f6f1;
		width: 100%;
		height: auto;
		max-height: 100vh;
		display: block;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
	}
	
	.lobby-indicator {
		position: absolute;
		top: 20px;
		left: 20px;
		background: rgba(255, 255, 255, 0.95);
		color: #2c3e50;
		padding: 15px 20px;
		border-radius: 12px;
		font-family: 'Comic Neue', cursive;
		font-size: 14px;
		font-weight: 600;
		z-index: 1000;
		backdrop-filter: blur(10px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
		border: 2px solid #e8e4d9;
	}
	
	.lobby-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 5px;
	}
	
	.lobby-text {
		font-weight: 700;
		color: #34495e;
	}
	
	.lobby-code {
		font-size: 12px;
		color: #7f8c8d;
		font-weight: 500;
	}
	
	.player-list {
		position: absolute;
		top: 20px;
		right: 20px;
		background: rgba(255, 255, 255, 0.95);
		padding: 15px 20px;
		border-radius: 12px;
		font-family: 'Comic Neue', cursive;
		font-size: 14px;
		z-index: 1000;
		backdrop-filter: blur(10px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
		border: 2px solid #e8e4d9;
		min-width: 180px;
	}
	
	.player-list-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		font-weight: 700;
		color: #34495e;
		border-bottom: 2px solid #e8e4d9;
		padding-bottom: 8px;
	}
	
	.player-item {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 5px;
		padding: 4px 0;
	}
	
	.player-color-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: hsl(var(--player-hue), 100%, 50%);
		border: 2px solid #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}
	
	.player-name {
		font-size: 13px;
		color: #2c3e50;
		font-weight: 500;
	}
	
	.back-to-lobby-btn {
		position: absolute;
		bottom: 20px;
		right: 20px;
		background: rgba(255, 255, 255, 0.95);
		color: #2c3e50;
		border: 2px solid #e8e4d9;
		padding: 12px 18px;
		border-radius: 12px;
		font-family: 'Comic Neue', cursive;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		z-index: 1000;
		backdrop-filter: blur(10px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
		transition: all 0.3s ease;
	}
	
	.back-to-lobby-btn:hover {
		background: rgba(255, 255, 255, 1);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
	}
</style> 