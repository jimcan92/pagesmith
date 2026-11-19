<script lang="ts">
	import type { Snippet } from 'svelte';
	let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="group">
	<div class="items">{@render children()}</div>
	<div class="glabel">{label}</div>
</div>

<style>
	.group {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 0 10px;
		border-right: 1px solid var(--color-base-300);
		min-height: 74px;
	}
	.group:last-child { border-right: none; }
	.items { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; max-width: 460px; }
	.glabel { font-size: 10.5px; color: #8a8079; text-align: center; margin-top: 3px; }
	.items :global(.rb) {
		min-width: 30px; height: 30px; padding: 0 7px; border-radius: 5px; border: 1px solid transparent;
		background: transparent; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
	}
	.items :global(.rb:hover:not(:disabled)) { background: #f1ece5; border-color: var(--color-base-300); }
	.items :global(.rb.on) { background: #fbf3d2; border-color: #ecd77f; }
	.items :global(.rb:disabled) { opacity: 0.35; cursor: default; }
	.items :global(.rb.big) { flex-direction: column; height: 54px; min-width: 56px; font-size: 11.5px; gap: 1px; justify-content: center; }
	.items :global(.rb.big .ico) { font-size: 20px; line-height: 1; }
	.items :global(select.rs) { height: 30px; font-size: 13px; border: 1px solid var(--color-base-300); border-radius: 5px; padding: 0 4px; background: #fff; }
	.items :global(input[type='color']) { width: 30px; height: 30px; padding: 2px; border: 1px solid var(--color-base-300); border-radius: 5px; background: #fff; }
</style>
