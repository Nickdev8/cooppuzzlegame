<!-- client/src/routes/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import io, { Socket } from 'socket.io-client';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let socket: Socket;

  let canvasWidth = 800;
  let canvasHeight = 600;
  let objects: Record<string, any> = {};
  let mousePositions: Record<string,{x:number,y:number}> = {};

  let dragging = false;
  let dragId: string|null = null;
  const RADIUS = 20;
  let reportInterval: number;
  let spriteCache: Record<string, HTMLImageElement> = {};

  function reportSize() {
    socket.emit('initSize', { width: window.innerWidth, height: window.innerHeight });
  }

  function handleWindowMousemove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x>=0 && y>=0 && x<=canvasWidth && y<=canvasHeight) {
      socket.emit('movemouse', { x, y });
    } else {
      socket.emit('mouseLeave');
    }
    if (dragging) {
      socket.emit('drag', { x, y });
    }
  }
  function handleWindowMouseleave() { socket.emit('mouseLeave'); }
  function handleWindowMouseup() {
    if (dragging) {
      socket.emit('endDrag');
      dragging = false; dragId = null;
    }
  }

  function handleCanvasMousedown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let hit = false;
    for (const id in objects) {
      const o = objects[id];
      const dx = mx - o.x, dy = my - o.y;
      if (dx*dx + dy*dy <= RADIUS*RADIUS) {
        hit = true; dragging = true; dragId = id;
        socket.emit('startDrag', { id, x: mx, y: my });
        break;
      }
    }
    if (!hit && dragging) {
      socket.emit('endDrag');
      dragging = false; dragId = null;
    }
  }

  function handleCanvasMousemove(e: MouseEvent) {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    socket.emit('drag', { x: mx, y: my });
  }

  function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (const id in objects) {
      const o = objects[id];
      if (o.image) {
        let img = spriteCache[id];
        if (!img) {
          img = new Image();
          img.src = o.image;
          spriteCache[id] = img;
          img.onload = () => draw();
        }
        // rotate the image around its center
        ctx.save();                               // :contentReference[oaicite:7]{index=7}
        ctx.translate(o.x, o.y);                 // :contentReference[oaicite:8]{index=8}
        ctx.rotate(o.angle);                     // :contentReference[oaicite:9]{index=9}
        ctx.drawImage(img, -o.width/2, -o.height/2, o.width, o.height);  // :contentReference[oaicite:10]{index=10}
        ctx.restore();                            // :contentReference[oaicite:11]{index=11}
      } else {
        ctx.beginPath();
        ctx.arc(o.x, o.y, RADIUS, 0, Math.PI*2);
        ctx.fillStyle = 'blue';
        ctx.fill();
      }
    }
  }

  onMount(() => {
    socket = io('http://localhost:3000');
    reportSize();
    reportInterval = setInterval(reportSize, 2000);
    window.addEventListener('resize', reportSize);
    window.addEventListener('mousemove', handleWindowMousemove);
    window.addEventListener('mouseleave', handleWindowMouseleave);
    window.addEventListener('mouseup', handleWindowMouseup);

    socket.on('canvasSize', ({ width, height }) => {
      canvasWidth = width; canvasHeight = height;
      canvas.width = width; canvas.height = height;
    });

    socket.on('state', (data) => {
      objects = {};
      for (const o of data) objects[o.id] = o;
      draw();
    });
    socket.on('mouseMoved', ({ id, x, y }) => { mousePositions[id] = { x, y }; });
    socket.on('mouseRemoved', ({ id }) => { delete mousePositions[id]; });

    ctx = canvas.getContext('2d')!;
  });

  onDestroy(() => {
    clearInterval(reportInterval);
    window.removeEventListener('resize', reportSize);
    window.removeEventListener('mousemove', handleWindowMousemove);
    window.removeEventListener('mouseleave', handleWindowMouseleave);
    window.removeEventListener('mouseup', handleWindowMouseup);
  });
</script>

<div class="flex items-center justify-center h-screen w-screen">
  <div class="relative" style="width:{canvasWidth}px; height:{canvasHeight}px;">
    <canvas
      bind:this={canvas}
      width={canvasWidth}
      height={canvasHeight}
      class="block"
      on:mousedown={handleCanvasMousedown}
      on:mousemove={handleCanvasMousemove}
    ></canvas>
    {#each Object.entries(mousePositions) as [clientId,pos]}
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
</div>