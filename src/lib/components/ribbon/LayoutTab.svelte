<script lang="ts">
	import { PAPER_SIZES } from '#lib/model/defaults.ts';
	import { bgById } from '#lib/model/layout.ts';
	import type { Orientation, PaperKey } from '#lib/model/types.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { toast } from '#lib/state/toasts.svelte.ts';
	import { moveOverflow } from '#lib/state/actions.ts';
	import Group from './Group.svelte';

	const pg = $derived(doc.currentContent);
	const bgs = $derived(pg ? doc.project.template.backgrounds.filter((b) => b.orientation === pg.orientation) : []);
	const bgValue = $derived(
		!pg ? '' : pg.bg === 'none' ? 'none' : bgById(doc.project, pg.bg)?.orientation === pg.orientation ? pg.bg : pg.orientation
	);

	function setOrientation(o: Orientation) {
		if (!pg || pg.orientation === o) return;
		pg.orientation = o;
		if (pg.bg !== 'none' && bgById(doc.project, pg.bg)?.orientation !== o) pg.bg = 'default';
		pg.attachments.forEach((a) => delete a.box);
		doc.touch();
	}
	function setBg(v: string) {
		if (!pg) return;
		pg.bg = v === pg.orientation ? 'default' : v;
		doc.touch();
	}
	function bgToFollowing() {
		if (!pg) return;
		let n = 0;
		for (const p of doc.project.pages.slice(doc.pageIndex(pg.id) + 1)) {
			if (p.type === 'content' && p.orientation === pg.orientation) { p.bg = pg.bg; n++; }
		}
		doc.touch();
		toast(n ? `Applied to ${n} following ${pg.orientation} page(s)` : `No ${pg.orientation} pages after this one`);
	}
	function textPos(v: 'top' | 'middle' | 'bottom', center?: boolean) {
		if (!pg) return;
		pg.textV = v;
		if (center != null) pg.textAlign = center ? 'center' : '';
		doc.touch();
	}
</script>

<Group label="Page">
	<button class="rb big" class:on={pg?.orientation === 'portrait'} disabled={!pg} onclick={() => setOrientation('portrait')}><span class="ico">▯</span>Portrait</button>
	<button class="rb big" class:on={pg?.orientation === 'landscape'} disabled={!pg} onclick={() => setOrientation('landscape')}><span class="ico">▭</span>Landscape</button>
	<div class="flex flex-col gap-1">
		<select class="rs" disabled={!pg} value={bgValue} onchange={(e) => setBg(e.currentTarget.value)} title="Background of this page">
			{#each bgs as b (b.id)}<option value={b.id}>{b.name}{b.src ? '' : ' (no image yet)'}</option>{/each}
			<option value="none">No background</option>
		</select>
		<button class="rb" disabled={!pg} onclick={bgToFollowing} title="Give the same background to the following pages">Use for following pages</button>
	</div>
</Group>

<Group label="Text on page">
	<div class="flex flex-col gap-1">
		<div class="flex gap-1">
			{#each [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']] as [v, l] (v)}
				<button class="rb" class:on={(pg?.textV || 'top') === v} disabled={!pg} onclick={() => textPos(v as 'top')}>{l}</button>
			{/each}
		</div>
		<div class="flex gap-1">
			<label class="rb"><input type="checkbox" class="checkbox checkbox-xs" disabled={!pg} checked={pg?.textAlign === 'center'}
				onchange={(e) => { if (pg) { pg.textAlign = e.currentTarget.checked ? 'center' : ''; doc.touch(); } }} /> Center horizontally</label>
			<button class="rb" disabled={!pg} onclick={() => textPos('middle', true)} title="For chapter / divider pages">Center on page</button>
		</div>
	</div>
</Group>

<Group label="Fit">
	<button class="rb big" disabled={!pg || !doc.warnings[pg.id]} onclick={() => pg && moveOverflow(pg.id)} title="Move what doesn't fit onto the next page">
		<span class="ico">⤵</span>Move overflow
	</button>
</Group>

<Group label="Document">
	<div class="flex flex-col gap-1">
		<select class="rs" value={doc.project.paper} onchange={(e) => { doc.project.paper = e.currentTarget.value as PaperKey; doc.touch(); }} title="Paper size">
			{#each Object.entries(PAPER_SIZES) as [k, v] (k)}<option value={k}>{v.name}</option>{/each}
		</select>
		<div class="flex items-center gap-1">
			<label class="rb"><input type="checkbox" class="checkbox checkbox-xs" checked={doc.project.pageNumbers.enabled}
				onchange={(e) => { doc.project.pageNumbers.enabled = e.currentTarget.checked; doc.touch(); }} /> Page numbers</label>
			<select class="rs" value={doc.project.pageNumbers.align} disabled={!doc.project.pageNumbers.enabled}
				onchange={(e) => { doc.project.pageNumbers.align = e.currentTarget.value as 'left'; doc.touch(); }}>
				<option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
			</select>
		</div>
	</div>
</Group>
