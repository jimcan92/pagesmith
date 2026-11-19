<script lang="ts">
	import { makeContentPage } from '#lib/model/defaults.ts';
	import { LAYOUTS, boxForAspect, areaAspectFromMargins } from '#lib/model/layout.ts';
	import { LABEL_POS, cleanLabels, labelStyle } from '#lib/model/labels.ts';
	import type { ContentPage, LayoutKey, LabelStyle } from '#lib/model/types.ts';
	import { normalizeImage } from '#lib/io/images.ts';
	import { imageBlob, storeImage } from '#lib/state/storage.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { toast } from '#lib/state/toasts.svelte.ts';
	import Group from './Group.svelte';

	const pg = $derived(doc.selectedAtt ? (doc.pageById(doc.selectedAtt.pageId) as ContentPage | undefined) : undefined);
	const i = $derived(doc.selectedAtt?.i ?? -1);
	const a = $derived(pg?.attachments[i]);
	const L = $derived(pg ? labelStyle(pg) : null);
	const SIZES = [7, 8, 9, 9.5, 10, 11, 12, 14, 16, 18, 20, 24];

	function setLayout(v: LayoutKey) {
		if (!pg) return;
		if (v === 'free' && pg.layout !== 'free') {
			// start from the automatic arrangement: measured from the page on screen
			const area = document.querySelector(`.page-slot[data-page-id="${pg.id}"] .grid-area`) as HTMLElement | null;
			if (area) {
				const gr = area.getBoundingClientRect();
				area.querySelectorAll('figure').forEach((fig) => {
					const at = pg.attachments[+(fig as HTMLElement).dataset.i!];
					if (!at) return;
					const r = fig.querySelector('.imgbox')!.getBoundingClientRect();
					let w = r.width, h = r.height;
					if (at.ar && pg.fit !== 'cover') { if (w / h > at.ar) w = h * at.ar; else h = w / at.ar; }
					const cx = r.left + r.width / 2 - gr.left, cy = r.top + r.height / 2 - gr.top;
					at.box = { x: (cx - w / 2) / gr.width, y: (cy - h / 2) / gr.height, w: w / gr.width, h: h / gr.height };
				});
			}
		}
		pg.layout = v;
		doc.touch();
	}
	function setLabel(k: 'title' | 'caption', p: keyof LabelStyle, v: unknown) {
		if (!pg || !L) return;
		pg.labels = cleanLabels({ ...L, [k]: { ...L[k], [p]: v } });
		doc.touch();
	}
	function labelsToAll() {
		if (!pg) return;
		const l = cleanLabels(labelStyle(pg));
		doc.project.pages.forEach((p) => { if (p.type === 'content') { p.labels = structuredClone(l); p.showCaptions = pg!.showCaptions; } });
		doc.touch();
		toast('Title & caption settings applied to all pages');
	}
	function order(d: -1 | 1) {
		if (!pg || !a) return;
		const j = i + d;
		if (j < 0 || j >= pg.attachments.length) return;
		[pg.attachments[i], pg.attachments[j]] = [pg.attachments[j], pg.attachments[i]];
		doc.selectedAtt = { pageId: pg.id, i: j };
		doc.touch();
	}
	async function rotate() {
		if (!pg || !a) return;
		const blob = imageBlob(a.src);
		if (!blob) return;
		const r = await normalizeImage(blob, 90);
		a.src = await storeImage(r.blob);
		a.ar = r.w / r.h;
		if (a.box) a.box = boxForAspect(areaAspectFromMargins(doc.project, pg), a.ar, a.box.w, a.box.x + a.box.w / 2, a.box.y + a.box.h / 2);
		doc.touch();
	}
	function ownPage() {
		if (!pg || !a) return;
		const [moved] = pg.attachments.splice(i, 1);
		delete moved.box;
		const np = makeContentPage(pg.orientation, pg.bg);
		np.attachments.push(moved);
		np.labels = pg.labels ? structuredClone($state.snapshot(pg.labels)) : undefined;
		doc.selectedAtt = null;
		doc.insertPages([np], pg.id);
	}
	function remove() {
		if (!pg) return;
		pg.attachments.splice(i, 1);
		doc.selectedAtt = null;
		doc.touch();
	}
</script>

{#if pg && a && L}
	<Group label="Arrange">
		<div class="flex flex-col gap-1">
			<select class="rs" value={pg.layout} onchange={(e) => setLayout(e.currentTarget.value as LayoutKey)} title="How the pictures on this page are arranged">
				{#each LAYOUTS as [v, l] (v)}<option value={v}>{l}</option>{/each}
			</select>
			<select class="rs" value={pg.fit} onchange={(e) => { pg.fit = e.currentTarget.value as 'contain'; doc.touch(); }}>
				<option value="contain">Whole picture</option><option value="cover">Fill box (crop)</option>
			</select>
		</div>
		<button class="rb big" onclick={() => order(-1)} disabled={i === 0} title={pg.layout === 'free' ? 'Send backward' : 'Move earlier'}><span class="ico">◀</span>{pg.layout === 'free' ? 'Backward' : 'Earlier'}</button>
		<button class="rb big" onclick={() => order(1)} disabled={i === pg.attachments.length - 1} title={pg.layout === 'free' ? 'Bring forward' : 'Move later'}><span class="ico">▶</span>{pg.layout === 'free' ? 'Forward' : 'Later'}</button>
		<button class="rb big" onclick={rotate} title="Rotate 90°"><span class="ico">⟳</span>Rotate</button>
	</Group>

	<Group label="Titles & captions (this page)">
		<div class="flex flex-col gap-1">
			{#each ['title', 'caption'] as const as k (k)}
				<div class="flex items-center gap-1">
					<span class="w-12 text-xs opacity-70">{k === 'title' ? 'Title' : 'Caption'}</span>
					<select class="rs" value={L[k].pos} onchange={(e) => setLabel(k, 'pos', e.currentTarget.value)}>
						{#each LABEL_POS as [v, l] (v)}<option value={v}>{l}</option>{/each}
					</select>
					<select class="rs" value={L[k].size} onchange={(e) => setLabel(k, 'size', +e.currentTarget.value)}>
						{#each SIZES as z (z)}<option value={z}>{z}</option>{/each}
					</select>
					<button class="rb" class:on={L[k].bold} onclick={() => setLabel(k, 'bold', !L[k].bold)}><b>B</b></button>
					<button class="rb" class:on={L[k].italic} onclick={() => setLabel(k, 'italic', !L[k].italic)}><i>I</i></button>
					<select class="rs" value={L[k].align} onchange={(e) => setLabel(k, 'align', e.currentTarget.value)}>
						<option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
					</select>
					<input type="color" value={L[k].color} oninput={(e) => setLabel(k, 'color', e.currentTarget.value)} />
				</div>
			{/each}
		</div>
		<div class="flex flex-col gap-1">
			<label class="rb"><input type="checkbox" class="checkbox checkbox-xs" checked={pg.showCaptions} onchange={(e) => { pg.showCaptions = e.currentTarget.checked; doc.touch(); }} /> Show captions</label>
			<button class="rb" onclick={labelsToAll}>Use on all pages</button>
		</div>
	</Group>

	<Group label="Picture">
		<button class="rb big" onclick={ownPage} title="Move this picture to a new page after this one"><span class="ico">⇲</span>Own page</button>
		<button class="rb big text-error" onclick={remove} title="Remove this picture"><span class="ico">✕</span>Delete</button>
	</Group>
	<div class="tip">Type the title and caption right on the page. Drag the picture to another page (or a thumbnail) to move it.</div>
{/if}

<style>
	.tip { align-self: center; font-size: 12px; color: #6b625b; max-width: 200px; padding: 0 10px; line-height: 1.4; }
</style>
