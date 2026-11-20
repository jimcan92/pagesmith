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
		flex: none;
		flex-direction: column;
		justify-content: space-between;
		padding: 0 10px;
		border-right: 1px solid var(--color-base-300);
		min-height: 74px;
	}
	.group:last-child { border-right: none; }
	.items { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; max-width: 460px; flex: 1; align-content: center; }
	.glabel { font-size: 11px; color: #6f6760; text-align: center; margin-top: 3px; }

	/* two stacked rows of small buttons, like Word's Font / Paragraph groups */
	.items :global(.rows) { display: flex; flex-direction: column; gap: 4px; }
	.items :global(.row) { display: flex; align-items: center; gap: 2px; }
	.items :global(.sep) { width: 1px; height: 18px; background: var(--color-base-300); margin: 0 3px; }

	.items :global(.rb) {
		min-width: 28px; height: 28px; padding: 0 6px; border-radius: 4px; border: 1px solid transparent; color: #3b3530;
		background: transparent; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap;
	}
	.items :global(.rb:hover:not(:disabled):not(.static)) { background: #f0ebe4; border-color: #e2dad0; }
	.items :global(.rb.on) { background: #f6e9c0; border-color: #e3cd7c; }
	.items :global(.rb:disabled), .items :global(.rb.disabled) { opacity: 0.38; cursor: default; pointer-events: none; }
	.items :global(.rb.text-error) { color: var(--color-error); }
	.items :global(.rb.static) { cursor: default; }

	/* every icon: same size, same stroke */
	.items :global(.rb svg.lucide) { width: 16px; height: 16px; stroke-width: 1.85; flex: none; }
	.items :global(.rb.big) { flex-direction: column; height: 58px; min-width: 58px; padding: 3px 6px; font-size: 12px; gap: 4px; }
	.items :global(.rb.big svg.lucide) { width: 26px; height: 26px; stroke-width: 1.5; color: var(--color-primary); }
	.items :global(.rb.big.text-error svg.lucide) { color: var(--color-error); }
	.items :global(.kbd-hint) { display: none; }

	/* colour picker that looks like a button: icon with a colour bar under it */
	.items :global(.color-btn) { position: relative; }
	.items :global(.color-btn svg.lucide) { width: 15px; height: 15px; }
	.items :global(.color-btn .swatch) { display: block; width: 16px; height: 4px; border-radius: 1px; margin-top: -1px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
	.items :global(.color-btn input) { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }

	.items :global(select.rs) { height: 28px; font-size: 12.5px; border: 1px solid #d6cdc2; border-radius: 4px; padding: 0 4px; background: #fff; }
	.items :global(select.rs:hover:not(:disabled)) { border-color: #b9aea1; }
	.items :global(input[type='color']:not(.color-btn input)) { width: 28px; height: 28px; padding: 2px; border: 1px solid #d6cdc2; border-radius: 4px; background: #fff; }
</style>
