<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import { moveOverflow } from '#lib/state/actions.ts';

	const idx = $derived(doc.pageIndex(doc.currentId));
	const warn = $derived(doc.warnings[doc.currentId]);
	const pct = $derived(Math.round(ui.scale * 100));
	const warnCount = $derived(Object.keys(doc.warnings).length);
</script>

<footer class="statusbar no-print">
	<span>Page {idx + 1} of {doc.project.pages.length}</span>
	{#if warnCount}<span class="text-error">⚠ {warnCount} page(s) too full</span>{/if}
	{#if warn}
		<button class="btn btn-xs btn-error btn-outline" onclick={() => moveOverflow(doc.currentId)} title={warn}>
			Move overflow to next page
		</button>
	{/if}
	<span class="grow"></span>
	<span class="opacity-70">{doc.saveStatus}</span>
	<button class="btn btn-xs btn-ghost" onclick={() => (ui.zoom = Math.max(0.2, +(ui.scale - 0.1).toFixed(2)))} aria-label="Zoom out">−</button>
	<input
		type="range" min="20" max="200" value={pct} class="range range-xs w-28"
		oninput={(e) => (ui.zoom = +(e.currentTarget as HTMLInputElement).value / 100)}
		aria-label="Zoom"
	/>
	<button class="btn btn-xs btn-ghost" onclick={() => (ui.zoom = Math.min(2, +(ui.scale + 0.1).toFixed(2)))} aria-label="Zoom in">＋</button>
	<span class="w-10 text-right">{pct}%</span>
	<button class="btn btn-xs" class:btn-active={ui.zoom === 'fit'} onclick={() => (ui.zoom = 'fit')}>Fit</button>
</footer>

<style>
	.statusbar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 3px 12px;
		font-size: 12px;
		background: #f7f5f2;
		border-top: 1px solid var(--color-base-300);
		flex: none;
	}
</style>
