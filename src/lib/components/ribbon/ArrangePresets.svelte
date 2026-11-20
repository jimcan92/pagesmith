<script lang="ts">
	import { PRESETS, presetBoxes, type PresetKey } from '#lib/model/presets.ts';
	import { areaAspectFromMargins } from '#lib/model/layout.ts';
	import type { ContentPage } from '#lib/model/types.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { track } from '#lib/analytics.ts';

	let { page }: { page: ContentPage } = $props();

	/** Aspect of the picture area: measured on screen when the page is showing, else from the margins. */
	function areaAspect() {
		const el = document.querySelector(`.page-slot[data-page-id="${page.id}"] .grid-area`) as HTMLElement | null;
		const r = el?.getBoundingClientRect();
		return r && r.width > 10 && r.height > 10 ? r.width / r.height : areaAspectFromMargins(doc.project, page);
	}

	const ars = $derived(page.attachments.map((a) => a.ar));
	const previewAspect = $derived(areaAspectFromMargins(doc.project, page));

	function apply(k: PresetKey) {
		track('preset-' + k);
		const boxes = presetBoxes(k, ars, areaAspect());
		page.attachments.forEach((a, i) => (a.box = boxes[i]));
		page.layout = 'free';
		doc.touch();
	}

	const PW = 18;
	const PH = $derived(Math.max(14, Math.min(26, PW / previewAspect)));
</script>

<div class="presets">
	{#each PRESETS as [k, name, tip] (k)}
		<button class="rb preset" onclick={() => apply(k)} title="{name}: {tip}" aria-label={name} disabled={!page.attachments.length}>
			<svg width={PW} height={PH} viewBox="0 0 {PW} {PH}" aria-hidden="true">
				<rect x="0.5" y="0.5" width={PW - 1} height={PH - 1} rx="1.5" class="pg" />
				{#each presetBoxes(k, ars.length ? ars : [0.77, 0.77], previewAspect) as b, i (i)}
					<rect x={2 + b.x * (PW - 4)} y={2 + b.y * (PH - 4)} width={Math.max(1, b.w * (PW - 4))} height={Math.max(1, b.h * (PH - 4))} class="pic" class:first={i === 0} />
				{/each}
			</svg>
			<span>{name}</span>
		</button>
	{/each}
</div>

<style>
	.presets { flex: none; display: grid; grid-template-columns: repeat(4, auto); gap: 2px 1px; }
	.presets :global(.rb.preset) { height: 30px; padding: 0 6px 0 3px; font-size: 11.5px; gap: 4px; justify-content: flex-start; }
	svg { flex: none; }
	.pg { fill: #fff; stroke: #c9bfb4; }
	.pic { fill: #b9d3f2; stroke: #2f7de1; stroke-width: 0.6; }
	.pic.first { fill: #8fb8ea; }
</style>
