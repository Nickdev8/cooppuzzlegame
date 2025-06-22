<script>
	import '../app.css';
	import { onMount } from 'svelte';

	onMount(() => {
		const setVh = () => {
			document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
		};

		window.addEventListener('resize', setVh);
		setVh();

		return () => window.removeEventListener('resize', setVh);
	});
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
</svelte:head>

<slot />
