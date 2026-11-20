<script lang="ts">
	import { cmd, equalizeColumns, live } from '#lib/state/editor.svelte.ts';
	import { contentWidthPx } from '#lib/model/layout.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import Group from './Group.svelte';
	import BetweenHorizontalStart from '@lucide/svelte/icons/between-horizontal-start';
	import BetweenHorizontalEnd from '@lucide/svelte/icons/between-horizontal-end';
	import BetweenVerticalStart from '@lucide/svelte/icons/between-vertical-start';
	import BetweenVerticalEnd from '@lucide/svelte/icons/between-vertical-end';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import TableColumnsSplit from '@lucide/svelte/icons/table-columns-split';
	import TableCellsMerge from '@lucide/svelte/icons/table-cells-merge';
	import TableCellsSplit from '@lucide/svelte/icons/table-cells-split';
	import PanelTop from '@lucide/svelte/icons/panel-top';
	import PaintBucket from '@lucide/svelte/icons/paint-bucket';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let shade = $state('#f3f0ea');

	const keep = (e: MouseEvent) => e.preventDefault();
	const equal = () => { const pg = doc.currentContent; if (pg) equalizeColumns(contentWidthPx(doc.project, pg) - 2); };
</script>

<Group label="Rows & columns">
	<div class="rows">
		<div class="row">
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addRowBefore())}><BetweenHorizontalStart />Row above</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addRowAfter())}><BetweenHorizontalEnd />Row below</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addColumnBefore())}><BetweenVerticalStart />Column left</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.addColumnAfter())}><BetweenVerticalEnd />Column right</button>
		</div>
		<div class="row">
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.deleteRow())}><Rows3 />Delete row</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.deleteColumn())}><Columns3 />Delete column</button>
			<button class="rb" onmousedown={keep} onclick={equal} title="Make all columns the same width"><TableColumnsSplit />Equal widths</button>
		</div>
	</div>
</Group>

<Group label="Cells">
	<div class="rows">
		<div class="row">
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.mergeCells())} title="Merge the selected cells (drag or Shift+click to select them)"><TableCellsMerge />Merge</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.splitCell())}><TableCellsSplit />Split</button>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.toggleHeaderRow())}><PanelTop />Header row</button>
		</div>
		<div class="row">
			<label class="rb color-btn" title="Cell shading">
				<span class="flex flex-col items-center"><PaintBucket /><span class="swatch" style="background:{shade}"></span></span>
				<input type="color" value={shade} oninput={(e) => { shade = e.currentTarget.value; cmd((c) => c.setCellAttribute('backgroundColor', shade)); }} />
			</label>
			<button class="rb" onmousedown={keep} onclick={() => cmd((c) => c.setCellAttribute('backgroundColor', null))}>No shading</button>
		</div>
	</div>
</Group>

<Group label="Table">
	<button class="rb big text-error" onmousedown={keep} onclick={() => cmd((c) => c.deleteTable())}><Trash2 />Delete table</button>
	<div class="text-xs opacity-70 max-w-36 leading-snug">Drag a column border to change its width.</div>
</Group>
{#if !live.editor}<span class="self-center text-xs opacity-60 px-2">Click inside a table first.</span>{/if}
