<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { startAnalytics } from '#lib/analytics.ts';
	let { children } = $props();
	onMount(startAnalytics);
</script>

{@render children()}
