<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import io, { Socket } from 'socket.io-client';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let socket: Socket;

	let canvasWidth = 800;
	let canvasHeight = 600;

	let objects: Record<string, { x: number; y: number }> = {};
	let mousePositions: Record<string, { x: number; y: number }> = {};

	let dragging = false;
	let dragId: string | null = null;
	const RADIUS = 20;

	function reportSize() {
		socket.emit('initSize', {
			width: window.innerWidth,
			height: window.innerHeight
		});
	}

	function handleWindowMousemove(e: MouseEvent) {
		socket.emit('movemouse', { x: e.clientX, y: e.clientY });
	}
	function handleWindowMouseleave() {
		socket.emit('mouseLeave');
	}
	function handleWindowMouseup() {
		if (dragging) {
			socket.emit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousedown(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		let hit = false;
		for (const id in objects) {
			const { x, y } = objects[id];
			const dx = mx - x;
			const dy = my - y;
			if (dx * dx + dy * dy <= RADIUS * RADIUS) {
				hit = true;
				dragging = true;
				dragId = id;
				socket.emit('startDrag', { x: mx, y: my });
				break;
			}
		}

		if (!hit && dragging) {
			socket.emit('endDrag');
			dragging = false;
			dragId = null;
		}
	}

	function handleCanvasMousemove(e: MouseEvent) {
		if (!dragging) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		socket.emit('drag', { x: mx, y: my });
	}

	function draw() {
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
		for (const id in objects) {
			const { x, y } = objects[id];
			ctx.beginPath();
			ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
			ctx.fillStyle = 'blue';
			ctx.fill();
		}
	}

	onMount(() => {
		socket = io('http://localhost:3000');

		reportSize();
		window.addEventListener('resize', reportSize);

		window.addEventListener('mousemove', handleWindowMousemove);
		window.addEventListener('mouseleave', handleWindowMouseleave);
		window.addEventListener('mouseup', handleWindowMouseup);

        socket.on('canvasSize', ({ width, height }) => {
			canvasWidth = width;
			canvasHeight = height;
			canvas.width = width;
			canvas.height = height;
		});

		socket.on('state', (data: Array<{ id: string; x: number; y: number }>) => {
			for (const obj of data) objects[obj.id] = { x: obj.x, y: obj.y };
			draw();
		});

		socket.on('mouseMoved', ({ id, x, y }) => {
			mousePositions[id] = { x, y };
		});
		socket.on('mouseRemoved', ({ id }) => {
			delete mousePositions[id];
		});

		ctx = canvas.getContext('2d')!;
	});

	onDestroy(() => {
		window.removeEventListener('resize', reportSize);
		window.removeEventListener('mousemove', handleWindowMousemove);
		window.removeEventListener('mouseleave', handleWindowMouseleave);
		window.removeEventListener('mouseup', handleWindowMouseup);
	});
</script>

<div style="position:relative; display:inline-block;">
	<canvas
		bind:this={canvas}
		width={canvasWidth}
		height={canvasHeight}
		style="display:block; margin:0; padding:0; background:#fafafa;"
		on:mousedown={handleCanvasMousedown}
		on:mousemove={handleCanvasMousemove}
	></canvas>

	{#each Object.entries(mousePositions) as [clientId, pos]}
		<div
			class="cursor"
			style="
        position:fixed;
        left: {pos.x}px;
        top: {pos.y}px;
        width: 8px;
        height: 8px;
        background: red;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      "
		></div>
	{/each}
</div>
