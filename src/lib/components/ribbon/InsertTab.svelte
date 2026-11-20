<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { openDialog } from '#lib/state/ui.svelte.ts';
	import { addFiles, addPdfPages, startWordImport } from '#lib/state/actions.ts';
	import { pickFiles } from '#lib/state/files.ts';
	import Group from './Group.svelte';
	import BookImage from '@lucide/svelte/icons/book-image';
	import RectangleVertical from '@lucide/svelte/icons/rectangle-vertical';
	import RectangleHorizontal from '@lucide/svelte/icons/rectangle-horizontal';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import Images from '@lucide/svelte/icons/images';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileType from '@lucide/svelte/icons/file-type';
	import Table from '@lucide/svelte/icons/table';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { live } from '#lib/state/editor.svelte.ts';
	import { openLinkDialog } from '#lib/state/links.ts';

	const linkable = $derived(!!doc.selectedAtt || !!live.editor);

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
	<button class="rb big" onclick={() => doc.addCover()} title="The cover (one per document)"><BookImage />Cover</button>
	<button class="rb big" onclick={() => doc.addPage('portrait')} title="Add a portrait page after this one"><RectangleVertical />Portrait</button>
	<button class="rb big" onclick={() => doc.addPage('landscape')} title="Add a landscape page after this one"><RectangleHorizontal />Landscape</button>
	<button class="rb big" onclick={() => openDialog('special')} title="A page with one of your special backgrounds"><Sparkles />Special</button>
</Group>

<Group label="Pictures & files">
	<button class="rb big" onclick={pictures} title="Add pictures to this page"><ImagePlus />Pictures</button>
	<button class="rb big" onclick={photosToPages} title="Many photos at once — pages are made for you"><Images />Photo pages</button>
	<button class="rb big" onclick={pdf} title="Each PDF page becomes a page"><FileText />PDF</button>
	<button class="rb big" onclick={word} title="Bring in a Word document (.docx)"><FileType />Word</button>
</Group>

<Group label="Tables">
	<button class="rb big" disabled={!doc.currentContent} onclick={() => openDialog('table')} title="Insert a table into the page text"><Table />Table</button>
</Group>

<Group label="Links">
	<!-- mousedown keeps the text selection in the editor -->
	<button class="rb big" disabled={!linkable} onmousedown={(e) => e.preventDefault()} onclick={openLinkDialog}
		title="Link the selected text or picture to a web address (Ctrl+K)"><Link2 />Link</button>
</Group>
