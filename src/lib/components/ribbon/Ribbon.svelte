<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { live } from '#lib/state/editor.svelte.ts';
	import { ui, openDialog, type Tab } from '#lib/state/ui.svelte.ts';
	import { exportPdf, openFromDisk, saveDocx } from '#lib/state/files.ts';
	import HomeTab from './HomeTab.svelte';
	import InsertTab from './InsertTab.svelte';
	import LayoutTab from './LayoutTab.svelte';
	import PictureTab from './PictureTab.svelte';
	import TableTab from './TableTab.svelte';
	import TemplateTab from './TemplateTab.svelte';
	import FilePlus2 from '@lucide/svelte/icons/file-plus-2';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Save from '@lucide/svelte/icons/save';
	import SaveAll from '@lucide/svelte/icons/save-all';
	import Printer from '@lucide/svelte/icons/printer';

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

	// When the ribbon changes height (e.g. the Picture tab comes up as you press on a picture),
	// scroll the canvas by the same amount so the page under the pointer doesn't jump.
	let ribbonH = 0;
	function keepCanvasStill(el: HTMLElement) {
		ribbonH = el.offsetHeight;
		const ro = new ResizeObserver(() => {
			const h = el.offsetHeight, d = h - ribbonH;
			ribbonH = h;
			const c = document.querySelector('.canvas-scroll') as HTMLElement | null;
			if (d && c) c.scrollTop += d;
		});
		ro.observe(el);
		return { destroy: () => ro.disconnect() };
	}

	const tabs = $derived<[Tab, string, boolean][]>([
		['home', 'Home', false],
		['insert', 'Insert', false],
		['layout', 'Layout', false],
		['template', 'Template', false],
		...(hasPic ? ([['picture', 'Picture', true]] as [Tab, string, boolean][]) : []),
		...(inTable ? ([['table', 'Table', true]] as [Tab, string, boolean][]) : [])
	]);

	/* ---------- File menu ---------- */
	let fileOpen = $state(false);
	let fileWrap = $state<HTMLDivElement>();
	const FILE_ITEMS = [
		['New…', '', FilePlus2, () => openDialog('new')],
		['Open…', 'Ctrl+O', FolderOpen, () => openFromDisk()],
		['Save', 'Ctrl+S', Save, () => saveDocx()],
		['Save as…', '', SaveAll, () => saveDocx(true)],
		['Export PDF / Print', 'Ctrl+P', Printer, () => exportPdf()]
	] as const;
	function run(fn: () => unknown) {
		fileOpen = false;
		fn();
	}
	$effect(() => {
		if (!fileOpen) return;
		const down = (e: PointerEvent) => { if (fileWrap && !fileWrap.contains(e.target as Node)) fileOpen = false; };
		const key = (e: KeyboardEvent) => { if (e.key === 'Escape') fileOpen = false; };
		document.addEventListener('pointerdown', down, true);
		document.addEventListener('keydown', key);
		return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
	});
</script>

<div class="ribbon no-print" use:keepCanvasStill>
	<div class="tabs-row" role="tablist">
		<div class="file-wrap" bind:this={fileWrap}>
			<button class="tab-btn file" class:open={fileOpen} aria-haspopup="menu" aria-expanded={fileOpen} onclick={() => (fileOpen = !fileOpen)}>File</button>
			{#if fileOpen}
				<div class="file-menu" role="menu">
					{#each FILE_ITEMS as [label, kbd, Ico, fn] (label)}
						<button role="menuitem" onclick={() => run(fn)}>
							<Ico /><span class="grow text-left">{label}</span>{#if kbd}<span class="kbd-s">{kbd}</span>{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		{#each tabs as [k, label, ctx] (k)}
			<button role="tab" aria-selected={ui.tab === k} class="tab-btn" class:active={ui.tab === k} class:ctx onclick={() => (ui.tab = k)}>{label}</button>
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
	.ribbon { background: #f3f0ec; border-bottom: 1px solid #e2dbd2; flex: none; padding-bottom: 6px; }
	.tabs-row { display: flex; align-items: flex-end; gap: 2px; padding: 4px 12px 0; }
	.tab-btn {
		position: relative; padding: 6px 12px 7px; font-size: 13.5px; border: none; border-radius: 5px 5px 0 0;
		background: transparent; cursor: pointer; color: #3b3530;
	}
	.tab-btn:hover { background: #e7e1d9; }
	.tab-btn.active { color: var(--color-primary); font-weight: 600; }
	.tab-btn.active::after {
		content: ''; position: absolute; left: 12px; right: 12px; bottom: 2px; height: 3px; border-radius: 2px; background: var(--color-primary);
	}
	.tab-btn.ctx { color: #2f7de1; }
	.tab-btn.ctx.active::after { background: #2f7de1; }

	.file-wrap { position: relative; margin-right: 4px; }
	.tab-btn.file { color: #3b3530; }
	.tab-btn.file.open { background: var(--color-primary); color: #fff; }
	.file-menu {
		position: absolute; left: 0; top: calc(100% + 2px); z-index: 60; width: 250px; padding: 6px;
		background: #fff; border: 1px solid #e2dbd2; border-radius: 8px; box-shadow: 0 10px 28px rgba(40, 25, 15, 0.18);
	}
	.file-menu button {
		display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 5px;
		font-size: 13.5px; background: transparent; border: none; cursor: pointer; color: #3b3530;
	}
	.file-menu button:hover { background: #f3eee8; }
	.file-menu :global(svg.lucide) { width: 18px; height: 18px; stroke-width: 1.75; color: var(--color-primary); flex: none; }
	.kbd-s { font-size: 11px; color: #8a8079; }

	/* the tools sit on a white card, like Word's ribbon */
	.panel {
		display: flex; align-items: stretch; margin: 0 8px; padding: 6px 4px 4px; min-height: 96px; /* every tab the same height, so the page doesn't move when tabs change */
		overflow-x: auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 2px rgba(40, 25, 15, 0.08), 0 0 0 1px #e8e2da;
	}
</style>
