<script lang="ts">
	import type { Attachment, Box, ContentPage } from '#lib/model/types.ts';
	import { gridFor, cascadeBox, clampBox, snapMove, MIN_FRAC, boxForAspect, areaAspectFromMargins } from '#lib/model/layout.ts';
	import { labelStyle, labelCss } from '#lib/model/labels.ts';
	import { plainText } from '#lib/model/sanitize.ts';
	import { imageUrl } from '#lib/state/storage.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { inlineEdit } from './inline-edit';
	import { pageAt, markDropTarget, autoScroll, suppressClick } from './drag';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { boxesFromScreen } from './measure';
	import { toast } from '#lib/state/toasts.svelte.ts';

	let { page, thumb = false }: { page: ContentPage; thumb?: boolean } = $props();

	const free = $derived(page.layout === 'free');
	const grid = $derived(gridFor(page));
	const L = $derived(labelStyle(page));
	let area = $state<HTMLDivElement>();

	const isSel = (i: number) => !thumb && doc.selectedAtt?.pageId === page.id && doc.selectedAtt.i === i;
	const boxOf = (a: Attachment, i: number): Box => a.box ?? cascadeBox(i);
	/** The border frame: the picture's own shape inside its box (whole box when the picture fills it). */
	function borderStyle(a: Attachment) {
		const b = a.border!;
		const size = page.fit === 'cover' || !a.ar
			? 'width:100%;height:100%'
			: `width:min(100cqw,calc(100cqh * ${a.ar}));height:min(100cqh,calc(100cqw / ${a.ar}))`;
		return `${size};border:${b.w}pt solid ${b.color}`;
	}
	const boxStyle = (b: Box) => `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;

	/** Which labels go where: above / on top / on bottom / below. */
	function parts(a: Attachment, selected: boolean) {
		const t = plainText(a.title) || selected ? 'title' : null;
		const c = page.showCaptions && (plainText(a.caption) || selected) ? 'caption' : null;
		const at = (pos: string) => {
			const tt = t && L.title.pos === pos ? ['title'] : [];
			const cc = c && L.caption.pos === pos ? ['caption'] : [];
			return (pos === 'above' || pos === 'top' ? [...tt, ...cc] : [...cc, ...tt]) as ('title' | 'caption')[];
		};
		return { above: at('above'), top: at('top'), bottom: at('bottom'), below: at('below') };
	}

	function setLabel(a: Attachment, k: 'title' | 'caption', html: string) {
		if (a[k] === html) return;
		a[k] = html;
		doc.touch();
	}

	function selectPic(i: number) {
		// pointerdown is preventDefault-ed (no text selection while dragging), so focus would stay
		// in e.g. the ribbon's layout dropdown and the arrow keys would change it instead of nudging
		const f = document.activeElement as HTMLElement | null;
		if (f && f !== document.body && !f.closest('figure')) f.blur();
		doc.select(page.id);
		doc.editingId = null;
		doc.selectedAtt = { pageId: page.id, i };
	}

	/* ---------- grid: drag onto another page / another picture ---------- */
	function gridDown(e: PointerEvent, i: number, fig: HTMLElement) {
		if (thumb || e.button !== 0) return;
		selectPic(i);
		const sx = e.clientX, sy = e.clientY;
		let ghost: HTMLDivElement | null = null;
		const st = { active: false, y: sy };
		const move = (ev: PointerEvent) => {
			st.y = ev.clientY;
			if (!st.active) {
				if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
				st.active = true;
				ghost = document.createElement('div');
				ghost.className = 'drag-ghost';
				ghost.innerHTML = `<img alt="" src="${imageUrl(page.attachments[i].src)}">`;
				document.body.appendChild(ghost);
				document.body.classList.add('dragging-pic');
				fig.classList.add('drag-source');
				autoScroll(st);
			}
			ghost!.style.left = ev.clientX + 'px';
			ghost!.style.top = ev.clientY + 'px';
			markDropTarget(pageAt(ev.clientX, ev.clientY)?.el ?? null);
		};
		const up = (ev: PointerEvent) => {
			document.removeEventListener('pointermove', move);
			document.removeEventListener('pointerup', up);
			if (!st.active) return;
			st.active = false;
			ghost?.remove();
			document.body.classList.remove('dragging-pic');
			fig.classList.remove('drag-source');
			markDropTarget(null);
			const t = pageAt(ev.clientX, ev.clientY);
			if (!t) return;
			const overFig = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('figure') as HTMLElement | null;
			const at = overFig && t.el.contains(overFig) && overFig.dataset.i != null ? +overFig.dataset.i : null;
			suppressClick();
			if (t.id === page.id) {
				// dropped on another picture: swap places in the grid
				if (at != null && at !== i) {
					const [a] = page.attachments.splice(i, 1);
					page.attachments.splice(at, 0, a);
					doc.selectedAtt = { pageId: page.id, i: at };
					doc.touch();
					return;
				}
				// dropped anywhere else: the picture goes where it was dropped (Manual layout)
				toManual(i, ev.clientX - sx, ev.clientY - sy);
				return;
			}
			doc.moveAttachment(page.id, i, t.id, at, placeNew);
		};
		document.addEventListener('pointermove', move);
		document.addEventListener('pointerup', up);
	}

	/** Switch the page to Manual layout (everything stays put) and move picture i by (dx, dy) screen px. */
	function toManual(i: number, dx: number, dy: number) {
		doc.commitHistory(); // so Undo goes back to exactly before the drag
		const gr = boxesFromScreen(page);
		const a = page.attachments[i];
		if (!gr || !a?.box) return;
		const b = { ...a.box, x: a.box.x + dx / gr.width, y: a.box.y + dy / gr.height };
		a.box = clampBox(snapMove(b));
		page.layout = 'free';
		doc.selectedAtt = { pageId: page.id, i };
		doc.touch();
		doc.commitHistory();
		toast('Switched this page to Manual layout so the picture can go anywhere', 7000, { label: 'Undo', run: () => doc.undo() });
	}

	/** Where a picture lands on a manual-layout page. */
	function placeNew(to: ContentPage, a: Attachment) {
		const k = to.attachments.length % 6;
		a.box = boxForAspect(areaAspectFromMargins(doc.project, to), a.ar || 4 / 3, 0.42, 0.3 + 0.08 * k, 0.3 + 0.08 * k);
	}

	/* ---------- manual layout: move / resize, or drop on another page ---------- */
	function freeDown(e: PointerEvent, i: number, fig: HTMLElement) {
		if (thumb || e.button !== 0 || !area) return;
		e.preventDefault();
		selectPic(i);
		const a = page.attachments[i];
		const start = { ...boxOf(a, i) };
		const handle = (e.target as HTMLElement).dataset.h;
		const mode = handle || 'move';
		const rect = area.getBoundingClientRect();
		const sx = e.clientX, sy = e.clientY;
		const k = start.h / start.w;
		let box = start, moved = false;
		const st = { active: false, y: sy };
		fig.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - sx) / rect.width, dy = (ev.clientY - sy) / rect.height;
			if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
			if (!moved && mode === 'move') { st.active = true; autoScroll(st); }
			moved = true;
			st.y = ev.clientY;
			const b = { ...start };
			if (mode === 'move') {
				b.x = start.x + dx; b.y = start.y + dy;
				if (!ev.altKey) snapMove(b);
				markDropTarget(pageAt(ev.clientX, ev.clientY)?.el ?? null, page.id);
			} else {
				const right = mode.includes('e'), bottom = mode.includes('s');
				let w = start.w + (right ? dx : -dx);
				let h = ev.shiftKey ? start.h + (bottom ? dy : -dy) : w * k;
				const roomW = right ? 1 - start.x : start.x + start.w;
				const roomH = bottom ? 1 - start.y : start.y + start.h;
				if (!ev.shiftKey) { const s = Math.min(1, roomW / w, roomH / h); if (s < 1) { w *= s; h *= s; } }
				w = Math.min(Math.max(MIN_FRAC, w), roomW); h = Math.min(Math.max(MIN_FRAC, h), roomH);
				b.w = w; b.h = h;
				b.x = right ? start.x : start.x + start.w - w;
				b.y = bottom ? start.y : start.y + start.h - h;
			}
			box = clampBox(b);
			fig.setAttribute('style', boxStyle(box));
		};
		const up = (ev: PointerEvent) => {
			fig.removeEventListener('pointermove', move);
			fig.removeEventListener('pointerup', up);
			fig.removeEventListener('pointercancel', up);
			st.active = false;
			markDropTarget(null);
			const t = moved && mode === 'move' ? pageAt(ev.clientX, ev.clientY) : null;
			if (t && t.id !== page.id) {
				suppressClick();
				doc.moveAttachment(page.id, i, t.id, null, placeNew);
				return;
			}
			if (moved) { a.box = box; doc.touch(); }
		};
		fig.addEventListener('pointermove', move);
		fig.addEventListener('pointerup', up);
		fig.addEventListener('pointercancel', up);
	}
</script>

{#snippet label(a: Attachment, k: 'title' | 'caption', selected: boolean)}
	{#if selected}
		<div
			class="lbl {k}"
			class:empty={!plainText(a[k])}
			style={labelCss(L[k])}
			data-ph={k === 'title' ? 'Add a title' : 'Add a caption'}
			use:inlineEdit={{ value: a[k], onchange: (h) => setLabel(a, k, h) }}
		></div>
	{:else}
		<div class="lbl {k}" style={labelCss(L[k])}>{@html a[k]}</div>
	{/if}
{/snippet}

<div
	class="grid-area"
	class:free
	bind:this={area}
	style={free ? '' : `grid-template-columns:repeat(${grid.c},minmax(0,1fr));grid-template-rows:repeat(${grid.r},minmax(0,1fr))`}
>
	{#each page.attachments as a, i (a.id)}
		{@const sel = isSel(i)}
		{@const p = parts(a, sel)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<figure
			data-i={i}
			class:free-item={free}
			class:selected={sel}
			class:interactive={!thumb}
			style={free ? boxStyle(boxOf(a, i)) : ''}
			onpointerdown={(e) => (free ? freeDown(e, i, e.currentTarget) : gridDown(e, i, e.currentTarget))}
		>
			{#each p.above as k (k)}{@render label(a, k, sel)}{/each}
			<div class="imgbox">
				<img alt="" draggable="false" src={imageUrl(a.src)} style="object-fit:{page.fit === 'cover' ? 'cover' : 'contain'}" />
				{#if a.border}
					<!-- drawn around the picture itself (not the empty space beside it), so it also prints in the PDF -->
					<span class="pic-border" style={borderStyle(a)}></span>
				{/if}
				{#if a.link && !thumb}
					<!-- a real link over the picture: the browser keeps it in the PDF (Print → Save as PDF) -->
					<a class="pic-link" href={a.link} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open {a.link}" tabindex="-1"></a>
					<button
						class="link-chip no-print"
						title="{a.link} (click to open)"
						aria-label="Open the picture's link"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={(e) => { e.stopPropagation(); window.open(a.link, '_blank', 'noopener'); }}
					><Link2 /></button>
				{/if}
				{#if p.top.length}<div class="overlay top">{#each p.top as k (k)}{@render label(a, k, sel)}{/each}</div>{/if}
				{#if p.bottom.length}<div class="overlay bottom">{#each p.bottom as k (k)}{@render label(a, k, sel)}{/each}</div>{/if}
			</div>
			{#each p.below as k (k)}{@render label(a, k, sel)}{/each}
			{#if free && sel}
				<span class="h no-print" data-h="nw"></span><span class="h no-print" data-h="ne"></span>
				<span class="h no-print" data-h="sw"></span><span class="h no-print" data-h="se"></span>
			{/if}
		</figure>
	{/each}
</div>

<style>
	figure.interactive { cursor: grab; touch-action: none; user-select: none; }
	figure.interactive:hover { outline: calc(1px / var(--s, 1)) dashed rgba(47, 125, 225, 0.6); }
	figure.selected { outline: calc(2px / var(--s, 1)) solid #2f7de1 !important; z-index: 5; }
	:global(figure.drag-source) { opacity: 0.35; }
	.free-item { position: absolute; margin: 0; }
	.imgbox:has(.pic-border) { container-type: size; }
	.pic-border {
		position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
		box-sizing: border-box; pointer-events: none; z-index: 1;
	}
	/* on screen the picture is dragged, not followed: the link only works in the PDF (and from the chip) */
	.pic-link { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
	.link-chip {
		position: absolute; top: calc(4px / var(--s, 1)); right: calc(4px / var(--s, 1)); z-index: 3;
		width: calc(22px / var(--s, 1)); height: calc(22px / var(--s, 1)); display: grid; place-items: center;
		border: none; border-radius: 50%; background: #1155cc; color: #fff; cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); opacity: 0.85;
	}
	.link-chip:hover { opacity: 1; }
	.link-chip :global(svg) { width: 62%; height: 62%; }
	.lbl.empty::before { content: attr(data-ph); color: #9aa; font-style: italic; font-weight: 400; }
	:global(.lbl[contenteditable='true']) { cursor: text; user-select: text; background: rgba(47, 125, 225, 0.06); }
	.h {
		position: absolute;
		width: calc(12px / var(--s, 1));
		height: calc(12px / var(--s, 1));
		background: #fff;
		border: calc(2px / var(--s, 1)) solid #2f7de1;
		border-radius: calc(3px / var(--s, 1));
		transform: translate(-50%, -50%);
		z-index: 6;
	}
	.h[data-h='nw'] { left: 0; top: 0; cursor: nwse-resize; }
	.h[data-h='ne'] { left: 100%; top: 0; cursor: nesw-resize; }
	.h[data-h='sw'] { left: 0; top: 100%; cursor: nesw-resize; }
	.h[data-h='se'] { left: 100%; top: 100%; cursor: nwse-resize; }
	@media print {
		figure { outline: none !important; }
		.lbl.empty { display: none; }
		:global(.lbl[contenteditable='true']) { background: none; }
	}
</style>
