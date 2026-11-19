<script lang="ts">
	import type { Snippet } from 'svelte';
	import { closeDialog } from '#lib/state/ui.svelte.ts';

	let { title, wide = false, children, actions, onclose }: {
		title: string; wide?: boolean; children: Snippet; actions?: Snippet; onclose?: () => void;
	} = $props();

	function close() {
		onclose?.();
		closeDialog();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="modal modal-open no-print" role="dialog" aria-modal="true" aria-label={title}>
	<div class="modal-box p-0 {wide ? 'max-w-3xl' : 'max-w-lg'}">
		<header class="flex items-center justify-between px-5 py-3 border-b border-base-300">
			<h3 class="font-bold">{title}</h3>
			<button class="btn btn-sm btn-ghost btn-circle" onclick={close} aria-label="Close">✕</button>
		</header>
		<div class="px-5 py-4 max-h-[70vh] overflow-y-auto">{@render children()}</div>
		{#if actions}<div class="modal-action px-5 pb-4 mt-0 flex-wrap">{@render actions()}</div>{/if}
	</div>
	<button class="modal-backdrop" onclick={close} aria-label="Close"></button>
</div>
