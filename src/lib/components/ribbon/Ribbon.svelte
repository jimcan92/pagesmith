<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { live } from '#lib/state/editor.svelte.ts';
	import { ui, type Tab } from '#lib/state/ui.svelte.ts';
	import HomeTab from './HomeTab.svelte';
	import InsertTab from './InsertTab.svelte';
	import LayoutTab from './LayoutTab.svelte';
	import PictureTab from './PictureTab.svelte';
	import TableTab from './TableTab.svelte';
	import TemplateTab from './TemplateTab.svelte';

	const inTable = $derived.by(() => { void live.v; return !!live.editor?.isActive('table'); });
	const hasPic = $derived(!!doc.selectedAtt);

	// contextual tabs come up when you select a picture / click into a table, and go away after
	let lastPic = false, lastTable = false;
	$effect(() => {
		if (hasPic && !lastPic) ui.tab = 'picture';
		else if (!hasPic && lastPic && ui.tab === 'picture') ui.tab = 'home';
		lastPic = hasPic;
	});
	$effect(() => {
		if (!inTable && lastTable && ui.tab === 'table') ui.tab = 'home';
		lastTable = inTable;
	});

	const tabs = $derived<[Tab, string, boolean][]>([
		['home', 'Home', false],
		['insert', 'Insert', false],
		['layout', 'Layout', false],
		...(hasPic ? ([['picture', 'Picture', true]] as [Tab, string, boolean][]) : []),
		...(inTable ? ([['table', 'Table', true]] as [Tab, string, boolean][]) : []),
		['template', 'Template', false]
	]);
</script>

<div class="ribbon no-print">
	<div class="tabs-row" role="tablist">
		{#each tabs as [k, label, ctx] (k)}
			<button role="tab" class="tab-btn" class:active={ui.tab === k} class:ctx onclick={() => (ui.tab = k)}>{label}</button>
		{/each}
	</div>
	<div class="panel">
		{#if ui.tab === 'home'}<HomeTab />
		{:else if ui.tab === 'insert'}<InsertTab />
		{:else if ui.tab === 'layout'}<LayoutTab />
		{:else if ui.tab === 'picture'}<PictureTab />
		{:else if ui.tab === 'table'}<TableTab />
		{:else}<TemplateTab />{/if}
	</div>
</div>

<style>
	.ribbon { background: #fff; border-bottom: 1px solid var(--color-base-300); flex: none; }
	.tabs-row { display: flex; gap: 2px; padding: 4px 10px 0; background: #faf8f5; border-bottom: 1px solid var(--color-base-300); }
	.tab-btn {
		padding: 5px 14px; font-size: 13px; border: 1px solid transparent; border-bottom: none;
		border-radius: 6px 6px 0 0; background: transparent; cursor: pointer; margin-bottom: -1px;
	}
	.tab-btn:hover { background: #f1ece5; }
	.tab-btn.active { background: #fff; border-color: var(--color-base-300); color: var(--color-primary); font-weight: 600; }
	.tab-btn.ctx { color: #2f7de1; }
	.tab-btn.ctx.active { color: #2f7de1; box-shadow: inset 0 3px 0 #2f7de1; }
	.panel { display: flex; align-items: stretch; padding: 6px 4px 4px; min-height: 92px; overflow-x: auto; }
</style>
