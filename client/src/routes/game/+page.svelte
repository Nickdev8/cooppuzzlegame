<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

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

	let canvasWidth = 800;
	let canvasHeight = 600;
	let objects: Record<string, BodyState> = {};
	let mousePositions: Record<string, { x: number; y: number }> = {};

	let dragging = false;
	let dragId: string | null = null;
	const RADIUS = 20;
	let spriteCache: Record<string, HTMLImageElement> = {};

	const log = (...args: any[]) => console.debug('[ESCAPE-CLIENT]', ...args);

	function reportSize(): void {
		const size = { width: window.innerWidth, height: window.innerHeight };
		log('→ reportSize()', size);
		try {
			socket.emit('initSize', size);
		} catch (err) {
			console.error('[reportSize] emit failed:', err);
		}
	}

	function handleWindowMousemove(e: MouseEvent): void {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		log('→ handleWindowMousemove', { x, y, dragging });
		try {
			if (x >= 0 && y >= 0 && x <= canvasWidth && y <= canvasHeight) {
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
		log('→ handleWindowMouseleave');
		socket.emit('mouseLeave');
	}

	function handleWindowMouseup(): void {
		log('→ handleWindowMouseup', { dragging, dragId });
		if (dragging) {
			socket.emit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousedown(e: MouseEvent): void {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		log('→ handleCanvasMousedown', { mx, my });
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
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		log('→ handleCanvasMousemove (dragging)', { mx, my });
		socket.emit('drag', { x: mx, y: my });
	}

	function draw(): void {
		const t0 = performance.now();
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
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
				ctx.fillStyle = 'blue';
				ctx.fill();
			}
		}
		const t1 = performance.now();
		log(`[draw] rendered ${Object.keys(objects).length} objects in ${(t1 - t0).toFixed(1)}ms`);
	}

	onMount(() => {
		log('[onMount] initializing');
		if (!canvas) {
			console.error('[onMount] canvas ref not set!');
			return;
		}
		ctx = canvas.getContext('2d')!;
		socket = io(location.origin, { transports: ['websocket'], timeout: 10000 });

		socket.on('connect', () => log('[socket] connect — id:', socket.id));
		socket.on('connect_error', (err) => console.error('[socket] connect_error:', err));
		socket.on('disconnect', (reason) => console.warn('[socket] disconnect:', reason));

		socket.on('canvasSize', ({ width: origW, height: origH }) => {
			const winW = window.innerWidth;
			const winH = window.innerHeight;

			const canvasRatio = origW / origH;
			const windowRatio = winW / winH;

			let newW: number, newH: number;

			if (windowRatio > canvasRatio) {
				newH = winH;
				newW = newH * canvasRatio;
			} else {
				newW = winW;
				newH = newW / canvasRatio;
			}

			canvasWidth = newW;
			canvasHeight = newH;
			canvas.width = newW;
			canvas.height = newH;
		});

		socket.on('state', (data: BodyState[]) => {
			log('[socket] state received —', data.length, 'bodies');
			objects = {};
			data.forEach((o: BodyState) => {
				objects[o.id] = o;
			});
			draw();
		});

		socket.on('mouseMoved', ({ id, x, y }: { id: string; x: number; y: number }) => {
			log('[socket] mouseMoved', { id, x, y });
			mousePositions[id] = { x, y };
		});

		socket.on('mouseRemoved', ({ id }: { id: string }) => {
			log('[socket] mouseRemoved', id);
			delete mousePositions[id];
		});

		reportSize();
		window.addEventListener('resize', reportSize);
		window.addEventListener('mousemove', handleWindowMousemove);
		window.addEventListener('mouseleave', handleWindowMouseleave);
		window.addEventListener('mouseup', handleWindowMouseup);
	});

	onDestroy(() => {
		log('[onDestroy] cleaning up');
		window.removeEventListener('resize', reportSize);
		window.removeEventListener('mousemove', handleWindowMousemove);
		window.removeEventListener('mouseleave', handleWindowMouseleave);
		window.removeEventListener('mouseup', handleWindowMouseup);
		socket.disconnect();
	});
</script>

<div class="full-height flex items-center justify-center">
	<canvas
		bind:this={canvas}
		width={canvasWidth}
		height={canvasHeight}
		on:mousedown={handleCanvasMousedown}
		on:mousemove={handleCanvasMousemove}
	></canvas>
	{#each Object.entries(mousePositions) as [clientId, pos]}
		<div
			class="cursor"
			style="
          position:absolute;
          left:{pos.x}px; top:{pos.y}px;
          width:8px; height:8px;
          background:red; border-radius:50%;
          transform:translate(-50%,-50%);
          pointer-events:none;
        "
		></div>
	{/each}
</div>

<style>
	.cursor {
		border: 1px solid yellow;
	}

	canvas {
		background-color: white;
	}

	.full-height {
		height: calc(var(--vh) * 100);
		width: 100vw;
		position: relative;
		overflow: hidden;
	}
</style>
