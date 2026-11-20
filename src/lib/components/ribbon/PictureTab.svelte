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
	import ArrangePresets from './ArrangePresets.svelte';
	import { boxesFromScreen } from '../page/measure';
	import SendToBack from '@lucide/svelte/icons/send-to-back';
	import BringToFront from '@lucide/svelte/icons/bring-to-front';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import FileOutput from '@lucide/svelte/icons/file-output';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { openLinkDialog } from '#lib/state/links.ts';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';

	const pg = $derived(doc.selectedAtt ? (doc.pageById(doc.selectedAtt.pageId) as ContentPage | undefined) : undefined);
	const i = $derived(doc.selectedAtt?.i ?? -1);
	const a = $derived(pg?.attachments[i]);
	const L = $derived(pg ? labelStyle(pg) : null);
	const SIZES = [7, 8, 9, 9.5, 10, 11, 12, 14, 16, 18, 20, 24];

	function setLayout(v: LayoutKey) {
		if (!pg) return;
		// start from the automatic arrangement: measured from the page on screen
		if (v === 'free' && pg.layout !== 'free') boxesFromScreen(pg);
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
		// pg/i/a follow the selection, so keep the page: they go undefined once it's cleared
		const from = pg;
		if (!from || !a) return;
		const np = makeContentPage(from.orientation, from.bg);
		np.labels = from.labels ? structuredClone($state.snapshot(from.labels)) : undefined;
		const [moved] = from.attachments.splice(i, 1);
		delete moved.box;
		np.attachments.push(moved);
		doc.selectedAtt = null;
		doc.insertPages([np], from.id);
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
		<div class="flex flex-col gap-1">
			<div class="flex gap-1">
				<button class="rb" onclick={() => order(-1)} disabled={i === 0} title={pg.layout === 'free' ? 'Send backward' : 'Move earlier'} aria-label={pg.layout === 'free' ? 'Send backward' : 'Move earlier'}>{#if pg.layout === 'free'}<SendToBack />{:else}<ChevronLeft />{/if}</button>
				<button class="rb" onclick={() => order(1)} disabled={i === pg.attachments.length - 1} title={pg.layout === 'free' ? 'Bring forward' : 'Move later'} aria-label={pg.layout === 'free' ? 'Bring forward' : 'Move later'}>{#if pg.layout === 'free'}<BringToFront />{:else}<ChevronRight />{/if}</button>
			</div>
			<button class="rb" onclick={rotate} title="Rotate 90°"><RotateCw />Rotate</button>
		</div>
	</Group>

	<Group label="Quick arrangements (this page)">
		<ArrangePresets page={pg} />
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
					<button class="rb" class:on={L[k].bold} onclick={() => setLabel(k, 'bold', !L[k].bold)} aria-label="Bold"><Bold /></button>
					<button class="rb" class:on={L[k].italic} onclick={() => setLabel(k, 'italic', !L[k].italic)} aria-label="Italic"><Italic /></button>
					<select class="rs" value={L[k].align} onchange={(e) => setLabel(k, 'align', e.currentTarget.value)}>
						<option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
					</select>
					<input type="color" value={L[k].color} oninput={(e) => setLabel(k, 'color', e.currentTarget.value)} />
				</div>
			{/each}
		</div>
	</Group>

	<Group label="Captions">
		<div class="flex flex-col gap-1">
			<label class="rb"><input type="checkbox" class="checkbox checkbox-xs" checked={pg.showCaptions} onchange={(e) => { pg.showCaptions = e.currentTarget.checked; doc.touch(); }} /> Show captions</label>
			<button class="rb" onclick={labelsToAll}>Use on all pages</button>
		</div>
	</Group>

	<Group label="Picture">
		<div class="flex flex-col gap-1">
			<button class="rb" class:on={!!a.link} onclick={openLinkDialog} title={a.link ? `Link: ${a.link} (Ctrl+K to change)` : 'Open a web address when the picture is clicked in the PDF or Word (Ctrl+K)'}><Link2 />{a.link ? 'Edit link' : 'Link'}</button>
			<button class="rb" onclick={ownPage} title="Move this picture to a new page after this one"><FileOutput />Own page</button>
			<button class="rb text-error" onclick={remove} title="Remove this picture (Delete key)"><Trash2 />Delete</button>
		</div>
	</Group>
	<div class="ribbon-tip"><div>Type the title and caption right on the page. Drag the picture to another page (or a thumbnail) to move it.</div></div>
{/if}

