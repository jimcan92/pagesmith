<script lang="ts">
	import { onMount } from 'svelte';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import { addFiles } from '#lib/state/actions.ts';
	import { exportPdf, openFromDisk, saveDocx } from '#lib/state/files.ts';
	import { clampBox, cascadeBox } from '#lib/model/layout.ts';
	import TitleBar from '#lib/components/TitleBar.svelte';
	import Ribbon from '#lib/components/ribbon/Ribbon.svelte';
	import ThumbRail from '#lib/components/ThumbRail.svelte';
	import Canvas from '#lib/components/Canvas.svelte';
	import StatusBar from '#lib/components/StatusBar.svelte';
	import Dialogs from '#lib/components/dialogs/Dialogs.svelte';
	import Toasts from '#lib/components/Toasts.svelte';

	onMount(() => {
		doc.boot();
	});

	const inText = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], .ProseMirror');

	function onkeydown(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && !e.altKey) {
			const k = e.key.toLowerCase();
			if (k === 's') { e.preventDefault(); saveDocx(e.shiftKey); return; }
			if (k === 'o') { e.preventDefault(); openFromDisk(); return; }
			if (k === 'p') { e.preventDefault(); exportPdf(); return; }
			// inside text, the editor's own undo handles typing
			if ((k === 'z' || k === 'y') && !inText(e.target) && !ui.dialog) {
				e.preventDefault();
				if (k === 'y' || e.shiftKey) doc.redo(); else doc.undo();
				return;
			}
		}
		// Esc in the page text stops editing (like clicking off the text)
		if (e.key === 'Escape' && !ui.dialog && (e.target as HTMLElement | null)?.closest?.('.ProseMirror')) {
			doc.editingId = null;
			return;
		}
		if (ui.dialog || inText(e.target)) return;
		const sel = doc.selectedAtt;
		const pg = sel ? doc.pageById(sel.pageId) : null;
		if (!sel || !pg || pg.type !== 'content') {
			if (e.key === 'Escape') { doc.editingId = null; }
			return;
		}
		const a = pg.attachments[sel.i];
		if (!a) return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			pg.attachments.splice(sel.i, 1);
			doc.selectedAtt = null;
			doc.touch();
		} else if (e.key === 'Escape') {
			doc.selectedAtt = null;
		} else if (pg.layout === 'free') {
			// arrow keys nudge the selected picture (Shift = bigger steps)
			const step = e.shiftKey ? 0.02 : 0.004;
			const dlt = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
			if (!dlt) return;
			e.preventDefault();
			const b = a.box ?? cascadeBox(sel.i);
			a.box = clampBox({ ...b, x: b.x + dlt[0], y: b.y + dlt[1] });
			doc.touch();
		}
	}

	// paste a screenshot (outside a text box) → picture on the current page
	function onpaste(e: ClipboardEvent) {
		if (inText(e.target)) {
			const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
			if (files.length && doc.editingId) { e.preventDefault(); addFiles(doc.editingId, files); }
			return;
		}
		const files = Array.from(e.clipboardData?.files || []);
		if (!files.length || !doc.currentContent) return;
		e.preventDefault();
		addFiles(doc.currentId, files);
	}
</script>

<svelte:window
	{onkeydown}
	{onpaste}
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => e.preventDefault()}
/>

<div class="app">
	<TitleBar />
	<Ribbon />
	<div class="work">
		<ThumbRail />
		{#if doc.ready}<Canvas />{:else}<div class="flex-1 grid place-items-center opacity-60">Loading…</div>{/if}
	</div>
	<StatusBar />
</div>
<Dialogs />
<Toasts />

<style>
	.app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
	.work { flex: 1; display: flex; min-height: 0; }
	:global(.drop-target) { outline: 3px dashed #2f7de1 !important; outline-offset: 3px; }
	:global(.drag-ghost) {
		position: fixed; z-index: 100; pointer-events: none; transform: translate(-50%, -50%) rotate(-3deg);
		width: 110px; padding: 4px; background: #fff; border-radius: 6px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	}
	:global(.drag-ghost img) { width: 100%; display: block; border-radius: 3px; }
	:global(body.dragging-pic), :global(body.dragging-pic *) { cursor: grabbing !important; }
	@media print {
		.app { height: auto; display: block; overflow: visible; }
		.work { display: block; }
	}
</style>
