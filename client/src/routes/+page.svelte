<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { browser } from '$app/environment';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let socket: Socket;

  let canvasWidth = 800;
  let canvasHeight = 600;
  let objects: Record<string, { x: number; y: number }> = {};
  let dragging = false;
  let dragId: string | null = null;

  let mousePositions: Record<string, { x: number; y: number }> = {};

  function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (const id in objects) {
      const { x, y } = objects[id];
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'blue';
      ctx.fill();
    }
  }

  onMount(async () => {
    if (!browser) return;

    // dynamically import so SSR never tries to load this module
    const mod = await import('socket.io-client');
    socket = mod.io('http://localhost:3000');

    // report our size immediately and on every resize
    const reportSize = () =>
      socket.emit('initSize', { width: innerWidth, height: innerHeight });
    reportSize();
    window.addEventListener('resize', reportSize);

    // handle canvas resizing from server
    socket.on('canvasSize', ({ width, height }) => {
      canvasWidth = width;
      canvasHeight = height;
      canvas.width = width;
      canvas.height = height;
    });

    // physics state
    socket.on('state', (data: Array<{ id: string; x: number; y: number }>) => {
      for (const obj of data) objects[obj.id] = { x: obj.x, y: obj.y };
      draw();
    });

    // live mouse updates
    socket.on('mouseMoved', ({ id, x, y }) => {
      mousePositions[id] = { x, y };
    });
    socket.on('mouseRemoved', ({ id }) => {
      delete mousePositions[id];
    });

    // global mouse tracking
    const handleWindowMousemove = (e: MouseEvent) => {
      socket.emit('movemouse', { x: e.clientX, y: e.clientY });
      if (dragging) {
        socket.emit('drag', {
          x: e.offsetX,
          y: e.offsetY
        });
      }
    };
    const handleWindowMouseleave = () => socket.emit('mouseLeave');
    const handleMouseup = () => {
      if (dragging) {
        socket.emit('endDrag');
        dragging = false;
        dragId = null;
      }
    };

    window.addEventListener('mousemove', handleWindowMousemove);
    window.addEventListener('mouseleave', handleWindowMouseleave);
    window.addEventListener('mouseup', handleMouseup);

    // set up your canvas
    ctx = canvas.getContext('2d')!;
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('resize', () => {});
      window.removeEventListener('mousemove', () => {});
      window.removeEventListener('mouseleave', () => {});
      window.removeEventListener('mouseup', () => {});
    }
  });

  function handleMousedown(e: MouseEvent) {
    const mx = e.offsetX,
      my = e.offsetY;
    for (const id in objects) {
      const { x, y } = objects[id];
      if (mx - x ** 2 + (my - y) ** 2 <= 20 ** 2) {
        dragging = true;
        dragId = id;
        socket.emit('startDrag', { x: mx, y: my });
        break;
      }
    }
  }
</script>

<canvas
  bind:this={canvas}
  width={canvasWidth}
  height={canvasHeight}
  style="display:block; margin:0; padding:0; background:#fafafa;"
  on:mousedown={handleMousedown}
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