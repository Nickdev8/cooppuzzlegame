<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

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

	let canvasWidth = 2048;
	let canvasHeight = 1024; // 2:1 ratio
	let objects: Record<string, any> = {};
	let grabbableObjects: Record<string, any> = {};
	let gameBall: any = null;
	let goal: any = null;
	let currentLevel = 0;
	let gameState = 'playing';
	let levelData: any = null;

	let dragging = false;
	let dragId: string | null = null;
	let dragOffset = { x: 0, y: 0 }; // Offset from mouse to object center
	const RADIUS = 20;
	let spriteCache: Record<string, HTMLImageElement | null> = {};

	// Add mouse movement tracking for throwing
	let lastMousePos = { x: 0, y: 0 };
	let mouseVelocity = { x: 0, y: 0 };
	let lastMouseTime = 0;

	let lobbyCode: string | null = null;
	let joinedPhysics = false;

	// Level transition animation
	let levelTransitioning = false;
	let transitionProgress = 0;
	let canvasLeft = 0;
	let canvasRight = 0;

	const log = (...args: any[]) => console.log(...args);
	// const log = (...args: any[]) => {};

	function colorForId(id: string): string {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		const hue = (hash >>> 0) % 360;
		return `hsl(${hue},100%,50%)`;
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
		const { x, y } = transformMouseToCanvas(e.clientX, e.clientY);
		const currentTime = performance.now();

		// Calculate mouse velocity (pixels per second)
		if (lastMouseTime > 0) {
			const deltaTime = (currentTime - lastMouseTime) / 1000; // Convert to seconds
			if (deltaTime > 0) {
				mouseVelocity.x = (x - lastMousePos.x) / deltaTime;
				mouseVelocity.y = (y - lastMousePos.y) / deltaTime;
			}
		}

		lastMousePos = { x, y };
		lastMouseTime = currentTime;

		log('handleWindowMousemove', { x, y, dragging, velocity: mouseVelocity });
		try {
			if (x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height) {
				safeEmit('movemouse', { x, y });
			} else {
				safeEmit('mouseLeave');
			}
			if (dragging && dragId) {
				// Only send drag events to server - no client-side position updates
				safeEmit('drag', { x, y });
			}
		} catch (err) {
			console.error('[handleWindowMousemove] emit error:', err);
		}
	}

	function handleWindowMouseleave(): void {
		log('handleWindowMouseleave');
		safeEmit('mouseLeave');
	}

	function handleWindowMouseup(): void {
		log('handleWindowMouseup', { dragging, dragId, velocity: mouseVelocity });
		if (dragging && dragId) {
			// Calculate throw velocity (reduced power)
			const throwVelocity = {
				x: mouseVelocity.x * 0.3, // Reduce power to 30%
				y: mouseVelocity.y * 0.3
			};
			
			safeEmit('endDrag', { velocity: throwVelocity });
			dragging = false;
			dragId = null;
			
			// Reset velocity tracking
			mouseVelocity = { x: 0, y: 0 };
			lastMouseTime = 0;
		}
	}

	function handleCanvasMousedown(e: MouseEvent): void {
		const { x: mx, y: my } = transformMouseToCanvas(e.clientX, e.clientY);
		log('handleCanvasMousedown', { mx, my });
		
		let hit = false;
		
		// Check grabbable objects first
		for (const id in grabbableObjects) {
			const o = grabbableObjects[id];
			const dx = mx - o.x;
			const dy = my - o.y;
			
			// Use rectangular hit detection for objects with width/height, circular for others
			let isHit = false;
			if (o.width && o.height) {
				// Rectangular hit detection - check if mouse is within the object bounds
				const halfWidth = o.width / 2;
				const halfHeight = o.height / 2;
				isHit = Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight;
			} else {
				// Circular hit detection for objects without explicit dimensions
				isHit = dx * dx + dy * dy <= RADIUS * RADIUS;
			}
			
			if (isHit) {
				hit = true;
				dragging = true;
				dragId = id;
				// Calculate offset from mouse to object center
				dragOffset.x = dx;
				dragOffset.y = dy;
				
				// Initialize mouse tracking for throwing
				lastMousePos = { x: mx, y: my };
				lastMouseTime = performance.now();
				mouseVelocity = { x: 0, y: 0 };
				
				log('   • startDrag on grabbable object', id, { mx, my, dragOffset, width: o.width, height: o.height });
				safeEmit('startDrag', { id, x: mx, y: my });
				break;
			}
		}
		
		if (!hit && dragging) {
			log('   • endDrag (missed hit)', { dragId });
			safeEmit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousemove(e: MouseEvent): void {
		if (!dragging) return;
		const { x: mx, y: my } = transformMouseToCanvas(e.clientX, e.clientY);
		log('handleCanvasMousemove (dragging)', { mx, my });
		safeEmit('drag', { x: mx, y: my });
	}

	function draw(): void {
		const t0 = performance.now();
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Apply level transition animation
		if (levelTransitioning) {
			ctx.save();
			ctx.translate(canvasLeft, 0);
		}

		// Draw hand-drawn style background
		drawHandDrawnBackground();

		// Draw static objects
		for (const id in objects) {
			const o = objects[id];
			ctx.save();
			ctx.translate(o.x, o.y);
			ctx.rotate(o.angle);
			
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
					img.onerror = (e) => {
						console.error('[draw] Image load error for', id, e);
						// Mark as failed to load
						spriteCache[id] = null;
						draw();
					};
				}
				
				if (img && img.complete && img.naturalWidth > 0) {
					ctx.drawImage(img, -o.width / 2, -o.height / 2, o.width, o.height);
				} else {
					// Draw purple rectangle fallback
					ctx.fillStyle = '#9c27b0';
					ctx.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
					ctx.strokeStyle = '#7b1fa2';
					ctx.lineWidth = 2;
					ctx.strokeRect(-o.width / 2, -o.height / 2, o.width, o.height);
				}
			} else {
				// Draw placeholder for objects without images
				ctx.fillStyle = o.type === 'flipper' ? '#ff6b6b' : '#4ecdc4';
				ctx.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
			}
			
			ctx.restore();
		}

		// Draw grabbable objects
		for (const id in grabbableObjects) {
			const o = grabbableObjects[id];
			ctx.save();
			ctx.translate(o.x, o.y);
			ctx.rotate(o.angle);
			
			if (o.image) {
				let img = spriteCache[id];
				if (!img) {
					img = new Image();
					img.src = o.image;
					spriteCache[id] = img;
					img.onload = () => {
						log('[draw] Image loaded for grabbable', id);
						draw();
					};
					img.onerror = (e) => {
						console.error('[draw] Image load error for grabbable', id, e);
						// Mark as failed to load
						spriteCache[id] = null;
						draw();
					};
				}
				
				if (img && img.complete && img.naturalWidth > 0) {
					ctx.drawImage(img, -o.width / 2, -o.height / 2, o.width, o.height);
				} else {
					// Draw purple rectangle fallback
					ctx.fillStyle = '#9c27b0';
					ctx.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
					ctx.strokeStyle = '#7b1fa2';
					ctx.lineWidth = 2;
					ctx.strokeRect(-o.width / 2, -o.height / 2, o.width, o.height);
				}
			} else {
				// Draw placeholder for grabbable objects without images
				ctx.fillStyle = '#96ceb4';
				ctx.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
			}
			
			ctx.restore();
		}

		// Draw game ball
		if (gameBall) {
			ctx.save();
			ctx.translate(gameBall.x, gameBall.y);
			ctx.rotate(gameBall.angle);
			
			if (gameBall.image) {
				let img = spriteCache['gameBall'];
				if (!img) {
					img = new Image();
					img.src = gameBall.image;
					spriteCache['gameBall'] = img;
					img.onload = () => {
						log('[draw] Ball image loaded');
						draw();
					};
					img.onerror = (e) => {
						console.error('[draw] Ball image load error:', e);
						// Mark as failed to load
						spriteCache['gameBall'] = null;
						draw();
					};
				}
				
				if (img && img.complete && img.naturalWidth > 0) {
					ctx.drawImage(img, -gameBall.width / 2, -gameBall.height / 2, gameBall.width, gameBall.height);
				} else {
					// Draw purple circle fallback
					ctx.fillStyle = '#9c27b0';
					ctx.beginPath();
					ctx.arc(0, 0, gameBall.width / 2, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = '#7b1fa2';
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			} else {
				// Draw ball placeholder
				ctx.fillStyle = '#ffd93d';
				ctx.beginPath();
				ctx.arc(0, 0, gameBall.width / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = '#f6c90e';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
			
			ctx.restore();
		}

		// Draw goal
		if (goal) {
			ctx.save();
			ctx.translate(goal.x, goal.y);
			
			if (goal.image) {
				let img = spriteCache['goal'];
				if (!img) {
					img = new Image();
					img.src = goal.image;
					spriteCache['goal'] = img;
					img.onload = () => {
						log('[draw] Goal image loaded');
						draw();
					};
					img.onerror = (e) => {
						console.error('[draw] Goal image load error:', e);
						// Mark as failed to load
						spriteCache['goal'] = null;
						draw();
					};
				}
				
				if (img && img.complete && img.naturalWidth > 0) {
					ctx.drawImage(img, -goal.width / 2, -goal.height / 2, goal.width, goal.height);
				} else {
					// Draw purple circle fallback
					ctx.fillStyle = 'rgba(156, 39, 176, 0.3)';
					ctx.beginPath();
					ctx.arc(0, 0, goal.width / 2, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = '#9c27b0';
					ctx.lineWidth = 3;
					ctx.stroke();
				}
			} else {
				// Draw goal placeholder
				ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
				ctx.beginPath();
				ctx.arc(0, 0, goal.width / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = '#4caf50';
				ctx.lineWidth = 3;
				ctx.stroke();
			}
			
			ctx.restore();
		}

		// Draw cursors
		for (const clientId in mousePositions) {
			const pos = mousePositions[clientId]!;
			const hue = cursorHues[clientId]!;

			ctx.save();
			ctx.filter = `hue-rotate(${hue}deg)`;
			ctx.drawImage(
				cursorImg,
				pos.x - 14, // Hotspot X offset
				pos.y - 8,  // Hotspot Y offset
				cursorSize,
				cursorSize
			);
			ctx.restore();
		}

		ctx.filter = 'none';

		// Restore canvas position after level transition
		if (levelTransitioning) {
			ctx.restore();
		}

		const t1 = performance.now();
		log(`[draw] rendered ${Object.keys(objects).length + Object.keys(grabbableObjects).length + (gameBall ? 1 : 0) + (goal ? 1 : 0)} objects in ${(t1 - t0).toFixed(1)}ms`);

		log('[draw] done');
	}

	function drawHandDrawnBackground() {
		// Create a subtle hand-drawn paper texture
		ctx.fillStyle = '#f8f6f0';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		// Add some hand-drawn grid lines
		ctx.strokeStyle = '#e8e4d8';
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);
		
		// Vertical lines
		for (let x = 0; x < canvas.width; x += 100) {
			ctx.beginPath();
			ctx.moveTo(x + Math.random() * 2, 0);
			ctx.lineTo(x + Math.random() * 2, canvas.height);
			ctx.stroke();
		}
		
		// Horizontal lines
		for (let y = 0; y < canvas.height; y += 100) {
			ctx.beginPath();
			ctx.moveTo(0, y + Math.random() * 2);
			ctx.lineTo(canvas.width, y + Math.random() * 2);
			ctx.stroke();
		}
		
		ctx.setLineDash([]);
	}

	function animateLevelTransition() {
		if (!levelTransitioning) return;
		
		transitionProgress += 0.02;
		if (transitionProgress >= 1) {
			levelTransitioning = false;
			transitionProgress = 0;
			canvasLeft = 0;
			canvasRight = 0;
			return;
		}
		
		// Slide canvas halves apart
		const slideDistance = canvas.width * 0.3;
		canvasLeft = -slideDistance * transitionProgress;
		canvasRight = slideDistance * transitionProgress;
		
		draw();
		requestAnimationFrame(animateLevelTransition);
	}

	onMount(() => {
		log('[onMount] initializing');

		// Set canvas to 2:1 aspect ratio (2048x1024)
		canvasWidth = 2048;
		canvasHeight = 1024; // 2:1 ratio
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		canvas.style.width = '100%';
		canvas.style.height = 'auto';

		// Debug: Log canvas dimensions
		setTimeout(() => {
			const rect = canvas.getBoundingClientRect();
			log('[onMount] Canvas dimensions:', {
				internal: { width: canvas.width, height: canvas.height },
				display: { width: rect.width, height: rect.height },
				scale: { x: canvas.width / rect.width, y: canvas.height / rect.height }
			});
		}, 100);

		// Extract lobby code from URL
		const params = new URLSearchParams(window.location.search);
		lobbyCode = params.get('lobby');
		if (!lobbyCode) {
			alert('No lobby code in URL!');
			return;
		}

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
		socket = io(location.origin, { transports: ['websocket'], timeout: 10000 });

		socket.on('connect', () => {
			const localId = socket.id!;
			cursorHues[localId] = Math.floor(Math.random() * 360);
			console.log('Local hue for', localId, ':', cursorHues[localId]);
			// Join the physics lobby
			socket.emit('joinPhysics', { lobby: lobbyCode });
		});

		socket.on('joinedPhysics', (data: { clientSideOwnershipEnabled: boolean }) => {
			joinedPhysics = true;
			log('[joinedPhysics] Client-side ownership enabled:', data.clientSideOwnershipEnabled);
		});

		socket.on('levelInfo', (data: { currentLevel: number; levelData: any; gameState: string }) => {
			currentLevel = data.currentLevel;
			levelData = data.levelData;
			gameState = data.gameState;
			log('[levelInfo] Received level info:', data);
		});

		socket.on('connect_error', (err) => console.error('[socket] connect_error:', err));
		socket.on('disconnect', (reason) => console.warn('[socket] disconnect:', reason));

		// update
		socket.on('state', (payload: any) => {
			// Update all objects from server
			objects = {};
			payload.bodies.forEach((o: any) => {
				objects[o.id] = o;
			});

			grabbableObjects = {};
			payload.grabbableObjects.forEach((o: any) => {
				grabbableObjects[o.id] = o;
			});

			gameBall = payload.gameBall;
			goal = payload.goal;
			
			// Check for level transition
			if (payload.gameState === 'levelComplete' && gameState !== 'levelComplete') {
				gameState = 'levelComplete';
				log('Level complete! Starting transition animation...');
				levelTransitioning = true;
				animateLevelTransition();
			} else if (payload.gameState === 'transitioning' && gameState !== 'transitioning') {
				gameState = 'transitioning';
				log('Level transitioning...');
			} else if (payload.gameState === 'playing' && gameState !== 'playing') {
				gameState = 'playing';
				log('New level loaded!');
			}

			currentLevel = payload.currentLevel;
			levelData = payload.levelData;

			log('Socket state received', payload);
			draw();
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
		
		// Add resize handler to debug canvas dimensions
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		log('[onDestroy] cleaning up');
		window.removeEventListener('mousemove', handleWindowMousemove);
		window.removeEventListener('mouseleave', handleWindowMouseleave);
		window.removeEventListener('mouseup', handleWindowMouseup);
		window.removeEventListener('resize', handleResize);
		socket.disconnect();
	});

	// --- Wrap socket emits to only send after joinedPhysics ---
	function safeEmit(event: string, data?: any) {
		if (joinedPhysics) {
			socket.emit(event, data);
		}
	}

	// Debug function for canvas dimensions
	function handleResize() {
		if (!canvas) return;
		setTimeout(() => {
			const rect = canvas.getBoundingClientRect();
			log('[resize] Canvas dimensions:', {
				internal: { width: canvas.width, height: canvas.height },
				display: { width: rect.width, height: rect.height },
				scale: { x: canvas.width / rect.width, y: canvas.height / rect.height }
			});
		}, 100);
	}

	// Coordinate transformation function to ensure consistent coordinates
	function transformMouseToCanvas(clientX: number, clientY: number): { x: number; y: number } {
		if (!canvas) return { x: clientX, y: clientY };
		
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		
		const x = (clientX - rect.left) * scaleX;
		const y = (clientY - rect.top) * scaleY;
		
		// Clamp coordinates to canvas bounds
		const clampedX = Math.max(0, Math.min(canvas.width, x));
		const clampedY = Math.max(0, Math.min(canvas.height, y));
		
		// Debug coordinate transformation occasionally
		if (Math.random() < 0.01) { // 1% chance to log
			log('[transform] Mouse coordinates:', {
				client: { x: clientX, y: clientY },
				rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
				scale: { x: scaleX, y: scaleY },
				transformed: { x: clampedX, y: clampedY },
				canvas: { width: canvas.width, height: canvas.height }
			});
		}
		
		return { x: clampedX, y: clampedY };
	}

	function handleSkipLevel() {
		console.log('Skip level button clicked');
		safeEmit('skipLevel');
	}
</script>

<div class="game-container">
	<div class="canvas-wrapper">
		<canvas
			bind:this={canvas}
			width={canvasWidth}
			height={canvasHeight}
			style="cursor:url(''/images/cursor.svg') 14 8, auto"
			on:mousedown={handleCanvasMousedown}
			on:mousemove={handleCanvasMousemove}
		></canvas>
	</div>
	
	<!-- Hand-drawn style UI overlay -->
	<div class="ui-overlay">
		<div class="info-panel">
			<div class="info-item">
				<span class="info-label">🎮 Lobby:</span>
				<span class="info-value">{lobbyCode}</span>
			</div>
			<div class="info-item">
				<span class="info-label">👥 Players:</span>
				<span class="info-value">{Object.keys(mousePositions).length + 1}</span>
			</div>
			{#if levelData}
				<div class="info-item">
					<span class="info-label">📋 Level:</span>
					<span class="info-value">{currentLevel + 1} - {levelData.name}</span>
				</div>
				<div class="info-item">
					<span class="info-label">🎯 Goal:</span>
					<span class="info-value">{levelData.description}</span>
				</div>
			{/if}
			{#if gameState === 'levelComplete'}
				<div class="info-item level-complete">
					<span class="info-label">🎉 Level Complete!</span>
				</div>
			{/if}
		</div>
		
		<!-- Development skip level button -->
		<div class="dev-panel">
			<button class="skip-level-btn" on:click={handleSkipLevel}>
				⏭️ Skip Level
			</button>
		</div>
	</div>
</div>

<style>
	.game-container {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		margin: 0;
		padding: 0;
	}

	.canvas-wrapper {
		position: relative;
		width: 100%;
		height: 100vh;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 20px;
		box-sizing: border-box;
		overflow: hidden;
		/* Ensure the wrapper respects the 2:1 aspect ratio */
		max-width: calc((100vh - 40px) * 2);
	}

	canvas {
		background-color: #f8f6f0;
		max-width: calc(100vw - 40px);
		max-height: calc(100vh - 40px);
		width: 100%;
		height: auto;
		display: block;
		border: 3px solid #8b7355;
		border-radius: 15px;
		box-shadow: 
			0 10px 30px rgba(0,0,0,0.2),
			0 0 0 1px rgba(139, 115, 85, 0.3);
		/* Maintain 2:1 aspect ratio */
		aspect-ratio: 2/1;
		object-fit: contain;
	}

	.ui-overlay {
		position: absolute;
		top: 20px;
		left: 20px;
		right: 20px;
		pointer-events: none;
		z-index: 10;
	}

	.info-panel {
		background: rgba(255, 255, 255, 0.95);
		border: 3px solid #8b7355;
		border-radius: 15px;
		padding: 15px 20px;
		box-shadow: 
			0 5px 15px rgba(0,0,0,0.1),
			0 0 0 1px rgba(139, 115, 85, 0.2);
		display: inline-block;
		pointer-events: none;
	}

	.info-item {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
		font-family: 'Comic Neue', cursive;
		font-size: 1rem;
	}

	.info-item:last-child {
		margin-bottom: 0;
	}

	.info-label {
		font-weight: 600;
		color: #5d4e37;
	}

	.info-value {
		font-weight: 700;
		color: #8b7355;
		background: #f0e6d2;
		padding: 2px 8px;
		border-radius: 8px;
		border: 1px solid #d4c4a8;
	}

	.level-complete {
		background: linear-gradient(45deg, #4caf50, #8bc34a);
		color: white;
		border-radius: 10px;
		padding: 8px 12px;
		margin-top: 10px;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.level-complete .info-label {
		color: white;
		font-weight: 700;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
	}

	/* Hand-drawn style decorations */
	.game-container::before {
		content: '';
		position: absolute;
		top: 10px;
		right: 10px;
		width: 60px;
		height: 60px;
		background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="%238b7355" stroke-width="3" stroke-dasharray="5,5"/><circle cx="50" cy="50" r="25" fill="none" stroke="%238b7355" stroke-width="2"/></svg>') no-repeat center;
		opacity: 0.3;
		pointer-events: none;
	}

	.game-container::after {
		content: '';
		position: absolute;
		bottom: 10px;
		right: 10px;
		width: 40px;
		height: 40px;
		background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20,80 L80,80 L80,20 L20,20 Z" fill="none" stroke="%238b7355" stroke-width="2" stroke-dasharray="3,3"/></svg>') no-repeat center;
		opacity: 0.3;
		pointer-events: none;
	}

	@media (max-width: 768px) {
		.ui-overlay {
			top: 10px;
			left: 10px;
			right: 10px;
		}

		.info-panel {
			padding: 10px 15px;
		}

		.info-item {
			font-size: 0.9rem;
		}

	}

	.dev-panel {
		position: absolute;
		top: 0;
		right: 0;
		pointer-events: auto;
	}

	.skip-level-btn {
		background: rgba(255, 193, 7, 0.9);
		color: #333;
		border: 2px solid #ff9800;
		border-radius: 10px;
		padding: 8px 12px;
		cursor: pointer;
		font-family: 'Comic Neue', cursive;
		font-size: 0.9rem;
		font-weight: 600;
		transition: all 0.3s ease;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
	}

	.skip-level-btn:hover {
		background: rgba(255, 193, 7, 1);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0,0,0,0.15);
	}

	.skip-level-btn:active {
		transform: translateY(0);
	}
</style>