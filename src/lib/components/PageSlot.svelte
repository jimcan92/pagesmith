<script lang="ts">
	import type { Page as PageT } from '#lib/model/types.ts';
	import { pageDims, bgLabel } from '#lib/model/layout.ts';
	import { overflowMessage } from '#lib/io/fit.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import { addFiles } from '#lib/state/actions.ts';
	import Page from './page/Page.svelte';

	let { page, index, pnum }: { page: PageT; index: number; pnum: number | null } = $props();

	const dims = $derived(pageDims(doc.project, page));
	const selected = $derived(doc.currentId === page.id);
	const warn = $derived(doc.warnings[page.id] || '');

	// keep the "too full" warning up to date (measured off-screen)
	$effect(() => {
		if (page.type !== 'content') return;
		// read everything the size depends on
		void [page.html, page.attachments.length, page.orientation, page.bg, page.textAlign, doc.project.paper, JSON.stringify(doc.project.template.backgrounds)];
		const msg = overflowMessage(doc.project, page);
		if ((doc.warnings[page.id] || '') !== msg) {
			if (msg) doc.warnings[page.id] = msg;
			else delete doc.warnings[page.id];
		}
	});

	function onclick(e: MouseEvent) {
		doc.select(page.id);
		// clicking outside the text / pictures ends editing and deselects pictures
		const t = e.target as HTMLElement;
		if (!t.closest('.editor-host, .ProseMirror, figure')) {
			if (doc.editingId === page.id) doc.editingId = null;
			doc.selectedAtt = null;
		}
	}
	function ondragover(e: DragEvent) {
		if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('drop-target'); }
	}
	function ondragleave(e: DragEvent) {
		(e.currentTarget as HTMLElement).classList.remove('drop-target');
	}
	function ondrop(e: DragEvent) {
		(e.currentTarget as HTMLElement).classList.remove('drop-target');
		const files = Array.from(e.dataTransfer?.files || []);
		if (!files.length) return;
		e.preventDefault();
		doc.select(page.id);
		addFiles(page.id, files);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="page-slot {dims.land ? 'landscape' : 'portrait'}"
	class:selected
	class:overflow={!!warn}
	data-page-id={page.id}
	style="width:{dims.w * 96 * ui.scale}px;height:{dims.h * 96 * ui.scale}px"
	{onclick}
	{ondragover}
	{ondragleave}
	{ondrop}
>
	<Page {page} scale={ui.scale} {pnum} />
	<span class="badge-label no-print">
		Page {index + 1} · {page.type === 'cover' ? 'Cover' : bgLabel(doc.project, page)}{dims.land ? ' · Landscape' : ''}
	</span>
	{#if warn}<span class="warn-label no-print">⚠ {warn}</span>{/if}
</div>

<style>
	.page-slot {
		position: relative;
		flex: none;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 6px 18px rgba(0, 0, 0, 0.12);
	}
	.page-slot.selected { outline: 3px solid var(--color-secondary); outline-offset: 3px; }
	.page-slot.overflow { outline: 3px solid var(--color-error); outline-offset: 3px; }
	.badge-label {
		position: absolute;
		left: 0;
		top: -20px;
		font-size: 11px;
		color: #6b625b;
		white-space: nowrap;
	}
	.warn-label {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 5px 10px;
		font-size: 12px;
		background: rgba(192, 57, 43, 0.92);
		color: #fff;
		text-align: center;
		pointer-events: none;
	}
</style>
