<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { exportPdf, saveDocx } from '#lib/state/files.ts';
	import Save from '@lucide/svelte/icons/save';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Redo2 from '@lucide/svelte/icons/redo-2';
	import Printer from '@lucide/svelte/icons/printer';
</script>

<header class="titlebar no-print">
	<div class="brand">
		<span class="logo">P</span>
		<div class="min-w-0">
			<div class="app">Pagesmith</div>
			<input class="name" bind:value={doc.project.name} oninput={() => doc.touch()} spellcheck="false" aria-label="Document name" />
		</div>
	</div>

	<div class="quick">
		<button class="qa" onclick={() => saveDocx()} title="Save (Ctrl+S)" aria-label="Save"><Save /></button>
		<button class="qa" disabled={!doc.canUndo} onclick={() => doc.undo()} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 /></button>
		<button class="qa" disabled={!doc.canRedo} onclick={() => doc.redo()} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 /></button>
	</div>

	<div class="grow"></div>
	<button class="btn btn-sm btn-secondary" onclick={() => saveDocx()} title="Save as a Word file (Ctrl+S)"><Save size={15} />Save</button>
	<button class="btn btn-sm btn-secondary btn-outline text-white" onclick={exportPdf} title="Export PDF / Print (Ctrl+P)"><Printer size={15} />Export PDF</button>
</header>

<style>
	.titlebar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: var(--color-primary);
		color: #fff;
		border-bottom: 3px solid var(--color-secondary);
		flex: none;
	}
	.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.logo {
		width: 32px; height: 32px; border-radius: 8px; background: var(--color-secondary); color: var(--color-primary);
		display: grid; place-items: center; font-weight: 800; font-size: 19px; flex: none;
	}
	.app { font-size: 11px; opacity: 0.8; letter-spacing: 0.05em; text-transform: uppercase; }
	.name {
		background: transparent; border: 1px solid transparent; color: inherit; font-size: 15px; font-weight: 600;
		padding: 1px 6px; margin-left: -6px; border-radius: 6px; width: min(380px, 36vw);
	}
	.name:hover, .name:focus { border-color: rgba(255, 255, 255, 0.4); outline: none; background: rgba(255, 255, 255, 0.08); }
	.quick { display: flex; align-items: center; gap: 2px; margin-left: 14px; padding-left: 12px; border-left: 1px solid rgba(255, 255, 255, 0.25); }
	.qa { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 5px; background: transparent; border: none; color: #fff; cursor: pointer; }
	.qa:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
	.qa:disabled { opacity: 0.35; cursor: default; }
	.qa :global(svg) { width: 18px; height: 18px; stroke-width: 1.85; }
</style>
