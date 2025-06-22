<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

	let anchors: { x: number; y: number }[] = [];

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

	let canvasWidth = 800;
	let canvasHeight = 600;
	let objects: Record<string, BodyState> = {};

	let dragging = false;
	let dragId: string | null = null;
	const RADIUS = 20;
	let spriteCache: Record<string, HTMLImageElement> = {};

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
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const x = (e.clientX - rect.left) * scaleX;
		const y = (e.clientY - rect.top) * scaleY;

		log('handleWindowMousemove', { x, y, dragging });
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
		log('handleWindowMouseleave');
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
		const t0 = performance.now();
		ctx.clearRect(0, 0, canvas.width, canvas.height);

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

		for (const clientId in mousePositions) {
			const pos = mousePositions[clientId]!;
			const hue = cursorHues[clientId]!;

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
		}

		ctx.filter = 'none';

		const t1 = performance.now();
		log(`[draw] rendered ${Object.keys(objects).length} objects in ${(t1 - t0).toFixed(1)}ms`);

		ctx.fillStyle = 'red';
		for (const p of anchors) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
			ctx.fill();
		}

		log('[draw] done');
	}

	onMount(() => {
		log('[onMount] initializing');

		canvasWidth = 1920;
		canvasHeight = 1080;
		canvas.width = 1920;
		canvas.height = 1080;
		canvas.style.width = '100%';
		canvas.style.height = 'auto';

		cursorImg = new Image(); // 'let' allows reassignment here
		cursorImg.src = '/images/cursor.svg';
		cursorImg.onload = () => {
			console.log('Cursor SVG loaded');
			draw(); // or start your render loop
		};

		if (!canvas) {
			console.error('[onMount] canvas ref not set!');
			return;
		}
		ctx = canvas.getContext('2d')!;
		socket = io(location.origin, { transports: ['websocket'], timeout: 10000 });

		socket.on('connect', () => {
			const localId = socket.id!; // assert non-null
			cursorHues[localId] = Math.floor(Math.random() * 360);
			console.log('Local hue for', localId, ':', cursorHues[localId]);
		});

		socket.on('connect_error', (err) => console.error('[socket] connect_error:', err));
		socket.on('disconnect', (reason) => console.warn('[socket] disconnect:', reason));

		// update
		socket.on('state', (payload: { bodies: BodyState[]; anchors: { x: number; y: number }[] }) => {
			objects = {};
			payload.bodies.forEach((o) => (objects[o.id] = o));

			anchors = payload.anchors;

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
	});

	onDestroy(() => {
		log('[onDestroy] cleaning up');
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
		style="cursor:url(''/images/cursor.svg') 14 8, auto"
		on:mousedown={handleCanvasMousedown}
		on:mousemove={handleCanvasMousemove}
	></canvas>
</div>

<style>
	canvas {
		background-color: white;
		width: 100%;
		height: auto;
		max-height: 100vh;
		display: block;
	}

	.full-height {
		height: calc(var(--vh) * 100);
		width: 100vw;
		position: relative;
		overflow: hidden;
	}
</style>
