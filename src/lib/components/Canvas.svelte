<script lang="ts">
	import { PAPER_SIZES } from '#lib/model/defaults.ts';
	import { pageNumbers } from '#lib/model/layout.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import PageSlot from './PageSlot.svelte';

	let scroller = $state<HTMLDivElement>();
	let width = $state(800);
	const nums = $derived(pageNumbers(doc.project));
	const paper = $derived(PAPER_SIZES[doc.project.paper] || PAPER_SIZES.long);
	const anyLandscape = $derived(doc.project.pages.some((p) => p.type === 'content' && p.orientation === 'landscape'));

	// "Fit": the widest page fits the canvas width
	$effect(() => {
		if (ui.zoom === 'fit') {
			const widest = (anyLandscape ? paper.h : paper.w) * 96;
			ui.scale = Math.max(0.2, Math.min(1.25, (width - 64) / widest));
		} else ui.scale = ui.zoom;
	});

	// bring the selected page into view when it changes from elsewhere (thumbnails, new pages)
	let lastId = '';
	$effect(() => {
		const id = doc.currentId;
		if (id && id !== lastId) {
			lastId = id;
			queueMicrotask(() => {
				const el = scroller?.querySelector(`.page-slot[data-page-id="${id}"]`) as HTMLElement | null;
				if (!el || !scroller) return;
				const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
				if (r.bottom < s.top + 40 || r.top > s.bottom - 40) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
			});
		}
	});

	// Ctrl + mouse wheel zooms
	function onwheel(e: WheelEvent) {
		if (!e.ctrlKey) return;
		e.preventDefault();
		ui.zoom = Math.max(0.2, Math.min(2, +(ui.scale * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2)));
	}

	// clicking the grey area around the pages ends text editing and deselects pictures
	function onclick(e: MouseEvent) {
		if (e.target !== scroller) return;
		doc.editingId = null;
		doc.selectedAtt = null;
	}
</script>

<svelte:head>
	{@html `<style>
		@page { size: ${paper.w}in ${paper.h}in; margin: 0; }
		@page ps-portrait { size: ${paper.w}in ${paper.h}in; margin: 0; }
		@page ps-landscape { size: ${paper.h}in ${paper.w}in; margin: 0; }
		@media print { .page-slot.portrait { page: ps-portrait; } .page-slot.landscape { page: ps-landscape; } }
	</style>`}
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="canvas-scroll" bind:this={scroller} bind:clientWidth={width} {onwheel} {onclick}>
	{#each doc.project.pages as page, i (page.id)}
		<PageSlot {page} index={i} pnum={nums[page.id] ?? null} />
	{/each}
</div>

<style>
	.canvas-scroll {
		flex: 1;
		min-width: 0;
		overflow: auto;
		background: #e9e5df;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 34px;
		padding: 34px 24px 80px;
	}
</style>
