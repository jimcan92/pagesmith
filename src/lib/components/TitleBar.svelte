<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { openDialog } from '#lib/state/ui.svelte.ts';
	import { exportPdf, openFromDisk, saveDocx } from '#lib/state/files.ts';

	let fileMenu = $state<HTMLDetailsElement>();
	const close = () => fileMenu && (fileMenu.open = false);
</script>

<header class="titlebar no-print">
	<div class="brand">
		<span class="logo">P</span>
		<div class="min-w-0">
			<div class="app">Pagesmith</div>
			<input class="name" bind:value={doc.project.name} oninput={() => doc.touch()} spellcheck="false" aria-label="Document name" />
		</div>
	</div>

	<details class="dropdown" bind:this={fileMenu}>
		<summary class="btn btn-sm btn-ghost text-white">File ▾</summary>
		<ul class="menu dropdown-content bg-base-100 text-base-content rounded-box shadow-lg border border-base-300 w-60 p-1 z-50">
			<li><button onclick={() => { close(); openDialog('new'); }}>New…</button></li>
			<li><button onclick={() => { close(); openFromDisk(); }}>Open… <kbd class="kbd kbd-xs ml-auto">Ctrl O</kbd></button></li>
			<li><button onclick={() => { close(); saveDocx(); }}>Save (.docx) <kbd class="kbd kbd-xs ml-auto">Ctrl S</kbd></button></li>
			<li><button onclick={() => { close(); saveDocx(true); }}>Save as…</button></li>
			<li><button onclick={() => { close(); exportPdf(); }}>Export PDF / Print <kbd class="kbd kbd-xs ml-auto">Ctrl P</kbd></button></li>
		</ul>
	</details>

	<div class="grow"></div>
	<button class="btn btn-sm btn-ghost text-white text-lg" disabled={!doc.canUndo} onclick={() => doc.undo()} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
	<button class="btn btn-sm btn-ghost text-white text-lg" disabled={!doc.canRedo} onclick={() => doc.redo()} title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
	<button class="btn btn-sm btn-secondary" onclick={() => saveDocx()} title="Save as a Word file (Ctrl+S)">Save</button>
	<button class="btn btn-sm btn-secondary btn-outline text-white" onclick={exportPdf}>Export PDF</button>
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
	.btn:disabled { opacity: 0.35; background: transparent; color: #fff; }
</style>
