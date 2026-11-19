<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { openDialog } from '#lib/state/ui.svelte.ts';
	import { addFiles, addPdfPages, startWordImport } from '#lib/state/actions.ts';
	import { pickFiles } from '#lib/state/files.ts';
	import Group from './Group.svelte';

	async function pictures() {
		const pg = doc.currentContent;
		if (!pg) return openDialog('photos', { files: await pickFiles('image/*', true) });
		const files = await pickFiles('image/*', true);
		if (files.length) addFiles(pg.id, files);
	}
	async function photosToPages() {
		const files = await pickFiles('image/*', true);
		if (files.length) openDialog('photos', { files });
	}
	async function pdf() {
		let after = doc.currentId;
		for (const f of await pickFiles('application/pdf', true)) after = (await addPdfPages(f, after)) ?? after;
	}
	async function word() {
		const [f] = await pickFiles('.docx');
		if (f) startWordImport(f);
	}
</script>

<Group label="Pages">
	<button class="rb big" onclick={() => doc.addPage('portrait')} title="Add a portrait page after this one"><span class="ico">▯</span>Portrait</button>
	<button class="rb big" onclick={() => doc.addPage('landscape')} title="Add a landscape page after this one"><span class="ico">▭</span>Landscape</button>
	<button class="rb big" onclick={() => openDialog('special')} title="A page with one of your special backgrounds"><span class="ico">✦</span>Special</button>
	<button class="rb big" onclick={() => doc.addCover()} title="The cover (one per document)"><span class="ico">★</span>Cover</button>
</Group>

<Group label="Pictures & files">
	<button class="rb big" onclick={pictures} title="Add pictures to this page"><span class="ico">🖼</span>Pictures</button>
	<button class="rb big" onclick={photosToPages} title="Many photos at once — pages are made for you"><span class="ico">▦</span>Photo pages</button>
	<button class="rb big" onclick={pdf} title="Each PDF page becomes a page"><span class="ico">📄</span>PDF</button>
	<button class="rb big" onclick={word} title="Bring in a Word document (.docx)"><span class="ico">W</span>Word</button>
</Group>

<Group label="Table">
	<button class="rb big" disabled={!doc.currentContent} onclick={() => openDialog('table')} title="Insert a table into the page text"><span class="ico">▤</span>Table</button>
</Group>
