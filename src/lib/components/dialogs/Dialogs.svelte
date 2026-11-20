<script lang="ts">
	import { blankTemplate, makeContentPage } from '#lib/model/defaults.ts';
	import { cmd } from '#lib/state/editor.svelte.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { ui, closeDialog } from '#lib/state/ui.svelte.ts';
	import { addPhotoPages, buildWordPages, startWordImport } from '#lib/state/actions.ts';
	import { importTemplateFile, openWordVersion, restoreFromDocx } from '#lib/state/files.ts';
	import { imageUrl } from '#lib/state/storage.ts';
	import { tick } from 'svelte';
	import Modal from './Modal.svelte';
	import TemplateDialog from './TemplateDialog.svelte';
	import LinkDialog from './LinkDialog.svelte';
	import { track } from '#lib/analytics.ts';

	const d = $derived(ui.dialog);

	/* New */
	let newName = $state('Untitled document');
	let newTpl = $state<'same' | 'default' | 'file' | 'blank'>('same');
	async function createNew() {
		const name = newName.trim() || 'Untitled document';
		let t = newTpl === 'same' ? $state.snapshot(doc.project.template) : newTpl === 'default' ? $state.snapshot(doc.defaultTemplate) : blankTemplate();
		if (newTpl === 'file') { const f = await importTemplateFile(); if (!f) return; t = f; }
		closeDialog();
		doc.newDocument(name, t);
	}

	/* Photo pages */
	let per = $state(4);
	let ori = $state<'portrait' | 'landscape' | 'auto'>('portrait');
	let fileNames = $state(false);
	let title = $state('');

	/* Word import */
	let wSkip = $state(true);
	let wSplit = $state(true);
	let wLayout = $state<'auto' | 'free'>('auto');
	$effect(() => {
		if (d?.kind === 'word') {
			const p = d.data.parsed.pages;
			wSkip = p[0].zeroMargins || (!p[0].html.replace(/<[^>]+>/g, '').trim() && p[0].pics.length > 0);
		}
	});

	/* Table */
	let rows = $state(3), cols = $state(3), head = $state(true);
	async function insertTable() {
		const pg = doc.currentContent;
		closeDialog();
		if (!pg) return;
		if (doc.editingId !== pg.id) { doc.editingId = pg.id; await tick(); await tick(); }
		cmd((c) => c.insertTable({ rows: Math.max(1, Math.min(40, rows)), cols: Math.max(1, Math.min(12, cols)), withHeaderRow: head }));
	}

	/* Confirm */
	function answer(v: boolean) {
		const r = d?.data?.resolve;
		closeDialog();
		r?.(v);
	}

	/* Export PDF */
	function print() {
		track('export-pdf');
		closeDialog();
		setTimeout(() => window.print(), 80);
	}
	const warnCount = $derived(Object.keys(doc.warnings).length);
</script>

{#if d?.kind === 'new'}
	<Modal title="New document">
		<label class="flex items-center gap-2"><span class="text-sm opacity-70 w-16">Name</span><input class="input input-sm flex-1" bind:value={newName} /></label>
		<h4 class="text-xs font-bold uppercase tracking-wide opacity-60 mt-4 mb-2">Template</h4>
		<div class="flex flex-col gap-2 text-sm">
			<label class="flex gap-2"><input type="radio" class="radio radio-sm" bind:group={newTpl} value="same" /> Same template as now ({doc.project.template.name})</label>
			<label class="flex gap-2"><input type="radio" class="radio radio-sm" bind:group={newTpl} value="default" /> My default template ({doc.defaultTemplate.name})</label>
			<label class="flex gap-2"><input type="radio" class="radio radio-sm" bind:group={newTpl} value="file" /> Load a template file (.template.json)…</label>
			<label class="flex gap-2"><input type="radio" class="radio radio-sm" bind:group={newTpl} value="blank" /> Blank template</label>
		</div>
		<p class="text-xs opacity-70 mt-3">The current document closes. You can bring it back with Undo, or save it first.</p>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={createNew}>Create</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'template'}
	<TemplateDialog />
{:else if d?.kind === 'photos'}
	<Modal title="Photo pages — pages are made for you">
		<p class="mb-3">{d.data.files.length} photo(s) selected.</p>
		<div class="grid grid-cols-[9rem_1fr] gap-2 items-center text-sm">
			<span class="opacity-70">Photos per page</span>
			<select class="select select-sm" bind:value={per}>{#each [1, 2, 3, 4, 6, 9] as n (n)}<option value={n}>{n}</option>{/each}</select>
			<span class="opacity-70">Orientation</span>
			<select class="select select-sm" bind:value={ori}>
				<option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="auto">Auto (1 per page: follow each photo)</option>
			</select>
			<span class="opacity-70">Title on each page</span>
			<input class="input input-sm" bind:value={title} placeholder="optional, e.g. Culminating activities" />
		</div>
		<label class="flex gap-2 mt-3 text-sm"><input type="checkbox" class="checkbox checkbox-sm" bind:checked={fileNames} /> Use file names as captions</label>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={() => { const files = d.data.files; closeDialog(); addPhotoPages(files, { per, orientation: ori, fileNames, title }); }}>Add pages</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'special'}
	{@const list = doc.project.template.backgrounds.filter((b) => b.id !== 'portrait' && b.id !== 'landscape')}
	<Modal title="Add a special page">
		{#if !list.length}
			<p>You have no special backgrounds yet.</p>
			<p class="text-sm opacity-70 mt-2">Special backgrounds are extra page designs (a divider page, a certificate frame, another header). Add them in <b>Template → Edit template</b>.</p>
		{:else}
			<div class="grid grid-cols-3 gap-3">
				{#each list as b (b.id)}
					<button class="card border border-base-300 p-2 hover:border-primary text-sm" onclick={() => { closeDialog(); doc.insertPages([makeContentPage(b.orientation, b.id)]); }}>
						<div class="mx-auto bg-base-200 bg-contain bg-center bg-no-repeat border border-base-300 {b.orientation === 'landscape' ? 'w-28 aspect-[13/8.5]' : 'w-16 aspect-[8.5/13]'}" style="background-image:url('{imageUrl(b.src)}')"></div>
						<div class="mt-1">{b.name}</div><div class="opacity-60 text-xs">{b.orientation}</div>
					</button>
				{/each}
			</div>
		{/if}
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Close</button>
			{#if !list.length}<button class="btn btn-sm btn-primary" onclick={() => (ui.dialog = { kind: 'template' })}>Open template</button>{/if}
		{/snippet}
	</Modal>
{:else if d?.kind === 'word'}
	{@const parsed = d.data.parsed}
	{@const land = parsed.pages.filter((p: { landscape: boolean }) => p.landscape).length}
	{@const pics = parsed.pages.reduce((a: number, p: { pics: unknown[] }) => a + p.pics.length, 0)}
	<Modal title="Import Word document">
		<p class="font-semibold mb-2">{d.data.file.name}</p>
		<ul class="list-disc pl-5 text-sm mb-3">
			<li>{parsed.pages.length} page(s) — {parsed.pages.length - land} portrait, {land} landscape</li>
			<li>{pics} picture(s) → attachments</li>
			{#if parsed.skippedBackgrounds}<li class="opacity-70">{parsed.skippedBackgrounds} background / logo picture(s) left out (your template provides those)</li>{/if}
			{#if parsed.skippedUnsupported}<li class="opacity-70">{parsed.skippedUnsupported} picture(s) in an unsupported format (EMF/WMF) left out</li>{/if}
		</ul>
		<label class="flex gap-2 text-sm mb-2"><input type="checkbox" class="checkbox checkbox-sm" bind:checked={wSkip} /> The first page is a cover — leave it out (use the template cover)</label>
		<label class="flex gap-2 text-sm mb-2"><input type="checkbox" class="checkbox checkbox-sm" bind:checked={wSplit} /> Split pages that are too full onto the next page (long tables continue)</label>
		<label class="flex items-center gap-2 text-sm"><span class="opacity-70">Pictures</span>
			<select class="select select-sm" bind:value={wLayout}><option value="auto">Auto layout</option><option value="free">Manual (drag & resize afterwards)</option></select>
		</label>
		<p class="text-xs opacity-70 mt-3">Pages are added after the selected page. Word's headers and footers are not imported — your template is used.</p>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={() => { const p = d.data.parsed, n = d.data.file.name; closeDialog(); buildWordPages(p, n, { skip: wSkip, split: wSplit, layout: wLayout }); }}>Import</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'table'}
	<Modal title="Insert table">
		<div class="flex gap-4 items-center text-sm">
			<label class="flex items-center gap-2">Rows <input type="number" min="1" max="40" class="input input-sm w-20" bind:value={rows} /></label>
			<label class="flex items-center gap-2">Columns <input type="number" min="1" max="12" class="input input-sm w-20" bind:value={cols} /></label>
		</div>
		<label class="flex gap-2 text-sm mt-3"><input type="checkbox" class="checkbox checkbox-sm" bind:checked={head} /> First row is a header</label>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={insertTable}>Insert</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'confirm'}
	<Modal title="Please confirm" onclose={() => d.data.resolve(false)}>
		<p>{d.data.message}</p>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={() => answer(false)}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={() => answer(true)}>{d.data.okLabel}</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'export'}
	<Modal title="Export PDF">
		{#if warnCount}<p class="text-error mb-2">⚠ {warnCount} page(s) are too full. Check the pages marked ⚠ first.</p>{/if}
		<ol class="list-decimal pl-5 leading-7">
			<li>Click <b>Open print window</b>.</li>
			<li>Destination: <b>Save as PDF</b> (or your printer).</li>
			<li>Under <b>More settings</b>: Margins <b>None</b>, Scale <b>Default</b>, and turn on <b>Background graphics</b>.</li>
			<li>Click <b>Save</b>. Portrait and landscape pages keep their own orientation.</li>
		</ol>
		<p class="text-xs opacity-70 mt-2">Use Google Chrome or Microsoft Edge for best results.</p>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={print}>Open print window</button>
		{/snippet}
	</Modal>
{:else if d?.kind === 'link'}
	<LinkDialog target={d.data} />
{:else if d?.kind === 'docxChoice'}
	<Modal title="This file was changed in Word">
		<p><b>{d.data.file.name}</b> was saved from Word after Pagesmith made it.</p>
		<ul class="list-disc pl-5 text-sm mt-2 leading-6">
			<li><b>Word's version</b>: brings in the changes made in Word. Pages may be laid out a little differently.</li>
			<li><b>Pagesmith's version</b>: exactly as it was last saved from Pagesmith. Changes made in Word are not included.</li>
		</ul>
		{#snippet actions()}
			<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
			<button class="btn btn-sm" onclick={() => { const { file, info } = d.data; closeDialog(); openWordVersion(file, info); }}>Word's version</button>
			<button class="btn btn-sm btn-primary" onclick={() => { const { file, info } = d.data; closeDialog(); restoreFromDocx(file, info); }}>Pagesmith's version</button>
		{/snippet}
	</Modal>
{/if}
