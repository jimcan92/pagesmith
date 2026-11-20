<script lang="ts">
	import { pageDims, pageNumbers } from '#lib/model/layout.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { confirmAsk } from '#lib/state/ui.svelte.ts';
	import { moveOverflow } from '#lib/state/actions.ts';
	import { hasText } from '#lib/model/sanitize.ts';
	import Page from './page/Page.svelte';

	const W = 104; // thumbnail width (px) of a portrait page
	const nums = $derived(pageNumbers(doc.project));
	let dragId: string | null = null;
	let overId = $state<string | null>(null);
	let menu = $state<{ id: string; x: number; y: number } | null>(null);

	const scaleFor = (w: number, h: number) => Math.min(W / (w * 96), (W * 1.53) / (h * 96));

	// keep the current page (the one being edited / selected) in view in the rail
	let rail = $state<HTMLElement>();
	$effect(() => {
		const id = doc.currentId;
		void doc.project.pages.length; // also after pages are added / removed
		if (!rail || !id) return;
		requestAnimationFrame(() => {
			const el = rail?.querySelector(`.thumb[data-page-id="${id}"]`) as HTMLElement | null;
			if (!el || !rail) return;
			const r = el.getBoundingClientRect(), s = rail.getBoundingClientRect();
			if (r.top < s.top + 4 || r.bottom > s.bottom - 4) {
				// center it, without moving the rest of the window
				rail.scrollTo({ top: rail.scrollTop + (r.top - s.top) - (s.height - r.height) / 2, behavior: 'smooth' });
			}
		});
	});

	function ondragstart(e: DragEvent, id: string) {
		dragId = id;
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/x-page', id);
	}
	function ondragover(e: DragEvent, id: string) {
		if (!dragId) return;
		e.preventDefault();
		overId = id;
	}
	function ondrop(e: DragEvent, id: string) {
		e.preventDefault();
		if (dragId && dragId !== id) doc.movePage(dragId, doc.pageIndex(id));
		dragId = null;
		overId = null;
	}

	async function del(id: string) {
		menu = null;
		const pg = doc.pageById(id);
		const busy = pg?.type === 'content' && (pg.attachments.length || hasText(pg.html));
		if (busy && !(await confirmAsk(`Delete page ${doc.pageIndex(id) + 1}? Its text and pictures will be removed.`, 'Delete page'))) return;
		doc.deletePage(id);
	}
	function oncontextmenu(e: MouseEvent, id: string) {
		e.preventDefault();
		doc.select(id);
		menu = { id, x: e.clientX, y: e.clientY };
	}
</script>

<svelte:window onclick={() => (menu = null)} onkeydown={(e) => e.key === 'Escape' && (menu = null)} />

<aside class="rail no-print" bind:this={rail}>
	{#each doc.project.pages as page, i (page.id)}
		{@const d = pageDims(doc.project, page)}
		{@const s = scaleFor(d.w, d.h)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="thumb"
			class:selected={doc.currentId === page.id}
			class:over={overId === page.id}
			data-page-id={page.id}
			draggable={page.type !== 'cover'}
			ondragstart={(e) => ondragstart(e, page.id)}
			ondragover={(e) => ondragover(e, page.id)}
			ondragleave={() => (overId = null)}
			ondrop={(e) => ondrop(e, page.id)}
			ondragend={() => { dragId = null; overId = null; }}
			onclick={() => doc.select(page.id)}
			oncontextmenu={(e) => oncontextmenu(e, page.id)}
			title="Page {i + 1} — drag to reorder, right-click for more"
		>
			<div class="mini" style="width:{d.w * 96 * s}px;height:{d.h * 96 * s}px">
				<Page {page} scale={s} pnum={nums[page.id] ?? null} thumb />
			</div>
			<div class="num">
				{i + 1}
				{#if doc.warnings[page.id]}<span class="text-error" title={doc.warnings[page.id]}>⚠</span>{/if}
			</div>
		</div>
	{/each}
	<div class="add">
		<button class="btn btn-xs btn-ghost" onclick={() => doc.addPage('portrait')} title="Add a portrait page">＋ Portrait</button>
		<button class="btn btn-xs btn-ghost" onclick={() => doc.addPage('landscape')} title="Add a landscape page">＋ Landscape</button>
	</div>
</aside>

{#if menu}
	{@const pg = doc.pageById(menu.id)}
	<ul class="menu bg-base-100 rounded-box shadow-lg border border-base-300 w-52 p-1 text-sm fixed z-50" style="left:{menu.x}px;top:{menu.y}px">
		{#if pg?.type === 'content'}
			<li><button onclick={() => { doc.duplicatePage(menu!.id); menu = null; }}>Duplicate page</button></li>
			<li><button onclick={() => { moveOverflow(menu!.id); menu = null; }}>Move overflow to next page</button></li>
			<li><button onclick={() => { doc.addPage(pg.orientation); menu = null; }}>Add page after</button></li>
		{/if}
		<li><button class="text-error" onclick={() => del(menu!.id)}>Delete page</button></li>
	</ul>
{/if}

<style>
	.rail {
		width: 138px;
		flex: none;
		overflow-y: auto;
		background: #f7f5f2;
		border-right: 1px solid var(--color-base-300);
		padding: 10px 8px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.thumb {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 5px;
		border-radius: 6px;
		border: 2px solid transparent;
		cursor: pointer;
		width: 100%;
	}
	.thumb:hover { background: #eee9e2; }
	.thumb.selected { border-color: var(--color-secondary); background: #fbf3d2; }
	.thumb.over { border-top: 3px solid var(--color-primary); }
	.mini { position: relative; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); pointer-events: none; }
	.num { font-size: 11px; color: #6b625b; }
	.add { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
</style>
