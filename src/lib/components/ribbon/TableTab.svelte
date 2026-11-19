<script lang="ts">
	import { cmd, equalizeColumns, live } from '#lib/state/editor.svelte.ts';
	import { contentWidthPx } from '#lib/model/layout.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import Group from './Group.svelte';

	const keep = (e: MouseEvent) => e.preventDefault();
	const equal = () => { const pg = doc.currentContent; if (pg) equalizeColumns(contentWidthPx(doc.project, pg) - 2); };
</script>

<Group label="Rows & columns">
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addRowBefore())}>+ Row above</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addRowAfter())}>+ Row below</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addColumnBefore())}>+ Column left</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addColumnAfter())}>+ Column right</button>
	<br />
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.deleteRow())}>− Row</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.deleteColumn())}>− Column</button>
	<button class="rb" onmousedown={keep} onclick={equal} title="Make all columns the same width">Equal widths</button>
</Group>

<Group label="Cells">
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.mergeCells())} title="Select cells first">Merge</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.splitCell())}>Split</button>
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.toggleHeaderRow())}>Header row</button>
	<br />
	<span class="text-xs opacity-70">Shading</span>
	<input type="color" value="#f3f0ea" oninput={(e) => { const v = e.currentTarget.value; cmd((c) => c.setCellAttribute('backgroundColor', v)); }} />
	<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.setCellAttribute('backgroundColor', null))}>No shading</button>
</Group>

<Group label="Table">
	<button class="rb big text-error" onmousedown={keep} onclick={() => cmd((c) => c.deleteTable())}><span class="ico">✕</span>Delete table</button>
	<div class="text-xs opacity-70 max-w-36 leading-snug">Drag a column border to change its width.</div>
</Group>
{#if !live.editor}<span class="self-center text-xs opacity-60 px-2">Click inside a table first.</span>{/if}
