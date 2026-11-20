<script lang="ts">
	import { closeDialog } from '#lib/state/ui.svelte.ts';
	import { applyLink, removeLink, type LinkTarget } from '#lib/state/links.ts';
	import { onMount } from 'svelte';
	import Modal from './Modal.svelte';

	let { target }: { target: LinkTarget } = $props();

	// svelte-ignore state_referenced_locally (the dialog edits a copy of what it was opened with)
	let url = $state(target.url);
	// svelte-ignore state_referenced_locally
	let text = $state(target.text);
	let error = $state('');
	let urlInput = $state<HTMLInputElement>();
	onMount(() => { urlInput?.focus(); urlInput?.select(); });

	function ok() {
		error = applyLink(target, url, text);
		if (!error) closeDialog();
	}
	function remove() {
		removeLink(target);
		closeDialog();
	}
</script>

<Modal title={target.url ? 'Edit link' : 'Insert link'}>
	<form class="flex flex-col gap-3 text-sm" onsubmit={(e) => { e.preventDefault(); ok(); }}>
		{#if !target.pic}
			<label class="flex flex-col gap-1">
				<span class="opacity-70">Text to show</span>
				<input class="input input-sm w-full" bind:value={text} placeholder="Leave empty to show the address" />
			</label>
		{:else}
			<p class="opacity-70">Clicking this picture in the PDF (or in Word) will open the address.</p>
		{/if}
		<label class="flex flex-col gap-1">
			<span class="opacity-70">Address</span>
			<input class="input input-sm w-full" bind:this={urlInput} bind:value={url} placeholder="https://drive.google.com/…" spellcheck="false" autocomplete="off" />
		</label>
		{#if error}<p class="text-error text-xs">{error}</p>{/if}
		<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
	</form>
	{#snippet actions()}
		{#if target.url}<button class="btn btn-sm btn-ghost text-error mr-auto" onclick={remove}>Remove link</button>{/if}
		<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
		<button class="btn btn-sm btn-primary" onclick={ok}>OK</button>
	{/snippet}
</Modal>
