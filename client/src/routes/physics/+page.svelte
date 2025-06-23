<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

	let anchors: { x: number; y: number }[] = [];
	let lobbyCode: string | null = null;

	interface BodyState {
		id: string;
		x: number;
		y: number;
		angle: number;
		width: number;
		height: number;
		image?: string;
	}

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
	let objects: Record<string, BodyState> = {};

	let dragging = false;
	let dragId: string | null = null;
	const RADIUS = 20;
	let spriteCache: Record<string, HTMLImageElement> = {};

	// Performance optimization for Raspberry Pi 4
	let lastDrawTime = 0;
	const targetFPS = 30; // Reduced from 60 for better performance
	const frameInterval = 1000 / targetFPS;
	let animationFrameId: number;

	const log = (...args: any[]) => console.log(...args);
	// const log = (...args: any[]) => {};

	function colorForId(id: string): string {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		const hue = (hash >>> 0) % 360;
		return `hsl(${hue}, 100%, 50%)`;
	}

	function makeCursorDataURL(color: string): string {
		const svg = `
     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
       <path d="M1,1 L31,16 L1,31 Z" fill="${color}" stroke="black" stroke-width="1"/>
     </svg>
   `.trim();
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}

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
			if (dragging) {
				socket.emit('drag', { x, y });
			}
		} catch (err) {
			console.error('[handleWindowMousemove] emit error:', err);
		}
	}

	function handleWindowMouseleave(): void {
		socket.emit('mouseLeave');
	}

	function handleWindowMouseup(): void {
		log('handleWindowMouseup', { dragging, dragId });
		if (dragging) {
			socket.emit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousedown(e: MouseEvent): void {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;
		log('handleCanvasMousedown', { mx, my });
		let hit = false;
		for (const id in objects) {
			const o = objects[id];
			const dx = mx - o.x;
			const dy = my - o.y;
			if (dx * dx + dy * dy <= RADIUS * RADIUS) {
				hit = true;
				dragging = true;
				dragId = id;
				log('   • startDrag on', id, { mx, my });
				socket.emit('startDrag', { id, x: mx, y: my });
				break;
			}
		}
		if (!hit && dragging) {
			log('   • endDrag (missed hit)', { dragId });
			socket.emit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousemove(e: MouseEvent): void {
		if (!dragging) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;
		log('handleCanvasMousemove (dragging)', { mx, my });
		socket.emit('drag', { x: mx, y: my });
	}

	function draw(): void {
		const now = performance.now();
		if (now - lastDrawTime < frameInterval) {
			animationFrameId = requestAnimationFrame(draw);
			return;
		}
		lastDrawTime = now;

		const t0 = performance.now();
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Draw bullet journal style background
		drawBulletJournalBackground();

		// Draw physics objects
		for (const id in objects) {
			const o = objects[id];
			if (o.image) {
				let img = spriteCache[id];
				if (!img) {
					img = new Image();
					img.src = o.image;
					spriteCache[id] = img;
					img.onload = () => {
						log('[draw] Image loaded for', id);
						draw();
					};
					img.onerror = (e) => console.error('[draw] Image load error for', id, e);
				}
				ctx.save();
				ctx.translate(o.x, o.y);
				ctx.rotate(o.angle);
				ctx.drawImage(img, -o.width / 2, -o.height / 2, o.width, o.height);
				ctx.restore();
			} else {
				ctx.beginPath();
				ctx.arc(o.x, o.y, RADIUS, 0, Math.PI * 2);
				ctx.fillStyle = '#4a90e2';
				ctx.fill();
				ctx.strokeStyle = '#2c3e50';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
		}

		// Draw anchors
		ctx.fillStyle = '#e74c3c';
		for (const p of anchors) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
			ctx.fill();
		}

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

		const t1 = performance.now();
		log(`[draw] rendered ${Object.keys(objects).length} objects in ${(t1 - t0).toFixed(1)}ms`);

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

	onMount(() => {
		log('[onMount] initializing physics engine');

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
		document.title = `Physics Engine - Lobby ${lobbyCode}`;
		
		console.log('[onMount] Joining physics engine for lobby:', lobbyCode);
		
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
			console.log('Joined physics engine for lobby:', lobbyCode);
		});

		socket.on('connect_error', (err) => console.error('[socket] connect_error:', err));
		socket.on('disconnect', (reason) => console.warn('[socket] disconnect:', reason));

		// Handle state updates
		socket.on('state', (payload: { bodies: BodyState[]; anchors: { x: number; y: number }[] }) => {
			objects = {};
			payload.bodies.forEach((o) => (objects[o.id] = o));
			anchors = payload.anchors;
		});

		// Handle player updates
		socket.on('players', (payload: PlayerInfo[]) => {
			players = payload;
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
		window.addEventListener('mouseup', handleWindowMouseup);
	});

	onDestroy(() => {
		log('[onDestroy] cleaning up');
		window.removeEventListener('mousemove', handleWindowMousemove);
		window.removeEventListener('mouseleave', handleWindowMouseleave);
		window.removeEventListener('mouseup', handleWindowMouseup);
		
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
		
		socket.disconnect();
	});
</script>

<div class="physics-container">
	<canvas
		bind:this={canvas}
		width={canvasWidth}
		height={canvasHeight}
		style="cursor:url('/images/cursor.svg') 14 8, auto"
		on:mousedown={handleCanvasMousedown}
		on:mousemove={handleCanvasMousemove}
	></canvas>
	
	{#if lobbyCode}
		<div class="lobby-indicator">
			<div class="lobby-header">
				<span class="lobby-icon">⚡</span>
				<span class="lobby-text">Physics Engine</span>
			</div>
			<div class="lobby-code">Lobby: {lobbyCode}</div>
		</div>
		
		<div class="player-list">
			<div class="player-list-header">
				<span class="player-icon">👥</span>
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
			← Back to Lobby
		</button>
	{/if}
</div>

<style>
	.physics-container {
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
	
	.lobby-icon {
		font-size: 16px;
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
	
	.player-icon {
		font-size: 16px;
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