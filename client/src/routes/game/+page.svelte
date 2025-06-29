<script lang="ts">
  import '../../app.css';
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    window.addEventListener('resize', setVh);
    setVh();

    // -- Canvas Dotted Grid --
    const canvas = document.getElementById('dotGrid') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    function drawDots() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const spacing = 30;
      const radius = 2;
      for (let y = spacing / 2; y < canvas.height; y += spacing) {
        for (let x = spacing / 2; x < canvas.width; x += spacing) {
          const jitterX = (Math.random() - 0.5) * 6;
          const jitterY = (Math.random() - 0.5) * 6;
          ctx.beginPath();
          ctx.arc(x + jitterX, y + jitterY, radius, 0, Math.PI * 2);
          ctx.fillStyle = '#ccc';
          ctx.fill();
        }
      }
    }

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawDots();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    onDestroy(() => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('resize', resizeCanvas);
    });
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <link href="https://fonts.googleapis.com/css2?family=Indie+Flower&family=Comic+Neue:wght@300;400;700&display=swap" rel="stylesheet">
</svelte:head>

<canvas id="dotGrid"></canvas>
<slot />

<style>
  #dotGrid {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
  }
</style>