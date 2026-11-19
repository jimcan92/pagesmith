<script lang="ts">
	import type { Page } from '#lib/model/types.ts';
	import { pageDims, resolveBg } from '#lib/model/layout.ts';
	import { imageUrl } from '#lib/state/storage.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import PageText from './PageText.svelte';
	import Pictures from './Pictures.svelte';

	let { page, scale = 1, pnum = null, thumb = false }: { page: Page; scale?: number; pnum?: number | null; thumb?: boolean } = $props();

	const dims = $derived(pageDims(doc.project, page));
	const bg = $derived(page.type === 'content' ? resolveBg(doc.project, page) : null);
	const m = $derived(bg?.margins);
	const pn = $derived(doc.project.pageNumbers);
	const justify = $derived(
		page.type === 'content' && (!page.attachments.length || page.textV === 'bottom')
			? ({ middle: 'center', bottom: 'flex-end' } as Record<string, string>)[page.textV] || 'flex-start'
			: 'flex-start'
	);
	const pnStyle = $derived(
		`bottom:${pn.bottom}in;` +
			(pn.align === 'center' ? 'left:0;right:0;text-align:center' : pn.align === 'left' ? `left:${pn.side}in` : `right:${pn.side}in`)
	);
</script>

<div class="ps-page" style="width:{dims.w}in;height:{dims.h}in;transform:scale({scale});--s:{scale}">
	{#if page.type === 'cover'}
		{#if doc.project.template.cover}
			<img class="cover-img" alt="" draggable="false" src={imageUrl(doc.project.template.cover)} />
		{:else}
			<div class="empty-cover no-print">No cover image yet.<br />Add one in <b>Template</b>.</div>
		{/if}
	{:else}
		{#if bg?.src}<img class="bg" alt="" draggable="false" src={imageUrl(bg.src)} />{/if}
		<div class="safe" style="top:{m!.top}in;right:{m!.right}in;bottom:{m!.bottom}in;left:{m!.left}in;justify-content:{justify}">
			<PageText {page} {thumb} />
			{#if page.attachments.length}<Pictures {page} {thumb} />{/if}
		</div>
	{/if}
	{#if pn.enabled && pnum != null}<div class="pnum" style={pnStyle}>{pnum}</div>{/if}
</div>
