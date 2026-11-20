/* Things the user does that touch files or several pages at once. */
import { makeContentPage, uid } from '#lib/model/defaults.ts';
import { areaAspectFromMargins, boxForAspect, contentWidthPx } from '#lib/model/layout.ts';
import { esc, safeUrl, sanitize } from '#lib/model/sanitize.ts';
import type { Attachment, ContentPage } from '#lib/model/types.ts';
import { baseName, importImageFile, isDocx, isImage, isPdf } from '#lib/io/images.ts';
import { importPdf } from '#lib/io/pdf.ts';
import { fitChain } from '#lib/io/fit.ts';
import type { DocxResult } from '#lib/io/docxImport.ts';
import { doc } from './doc.svelte';
import { toast } from './toasts.svelte';
import { openDialog } from './ui.svelte';
import { track } from '#lib/analytics.ts';

const newAtt = (id: string, w: number, h: number, caption = ''): Attachment => ({ id: uid('att'), src: id, title: '', caption, ar: w / h });

function placeFree(pg: ContentPage, a: Attachment) {
	const k = pg.attachments.length % 6;
	a.box = boxForAspect(areaAspectFromMargins(doc.project, pg), a.ar || 4 / 3, 0.42, 0.3 + 0.08 * k, 0.3 + 0.08 * k);
}

/** Files dropped/pasted/picked for a page: pictures go on it, each PDF page becomes a page, Word opens the import. */
export async function addFiles(pageId: string, files: File[]) {
	track('add-pictures');
	const pg = doc.pageById(pageId);
	const imgs = files.filter(isImage), pdfs = files.filter(isPdf), docx = files.filter(isDocx);
	if (!imgs.length && !pdfs.length && !docx.length) return toast('Only pictures, PDF and Word files can be added.');
	if (imgs.length) {
		if (!pg || pg.type !== 'content') toast('Pictures go on content pages, not the cover.');
		else {
			for (const f of imgs) {
				try {
					const { id, w, h } = await importImageFile(f);
					const a = newAtt(id, w, h);
					if (pg.layout === 'free') placeFree(pg, a);
					pg.attachments.push(a);
				} catch (e) {
					console.error(e);
					toast(`Could not read ${f.name}`);
				}
			}
			doc.touch();
		}
	}
	let after = pageId;
	for (const f of pdfs) after = (await addPdfPages(f, after)) ?? after;
	if (docx.length) await startWordImport(docx[0]);
}

export async function addPdfPages(file: File, afterId: string) {
	track('import-pdf');
	const created: ContentPage[] = [];
	const t = toast(`Reading ${file.name}…`, 0);
	try {
		await importPdf(file, ({ id, w, h, page, total }) => {
			t.set(`Reading ${file.name}: page ${page} of ${total}…`);
			const np = makeContentPage(w > h ? 'landscape' : 'portrait');
			np.layout = '1';
			np.showCaptions = false;
			np.attachments.push(newAtt(id, w, h, esc(`${baseName(file)} – p. ${page}`)));
			created.push(np);
		});
	} catch (e) {
		console.error(e);
		toast(`Could not read ${file.name}: ${(e as Error).message}`);
	} finally {
		t.close();
	}
	if (!created.length) return null;
	doc.insertPages(created, afterId);
	toast(`Added ${created.length} page(s) from ${file.name}`);
	return created[created.length - 1].id;
}

/** Many photos at once → pages with `per` photos each. */
export async function addPhotoPages(files: File[], opts: { per: number; orientation: 'portrait' | 'landscape' | 'auto'; fileNames: boolean; title: string }) {
	track('photo-pages');
	const t = toast('Adding photos…', 0);
	const pages: ContentPage[] = [];
	let pg: ContentPage | null = null;
	for (let i = 0; i < files.length; i++) {
		t.set(`Adding photo ${i + 1} of ${files.length}…`);
		let info;
		try { info = await importImageFile(files[i]); } catch { toast(`Could not read ${files[i].name}`); continue; }
		if (!pg || pg.attachments.length >= opts.per) {
			const o = opts.orientation === 'auto' ? (opts.per === 1 && info.w > info.h ? 'landscape' : 'portrait') : opts.orientation;
			pg = makeContentPage(o);
			pg.layout = ({ 1: '1', 2: o === 'landscape' ? '2h' : '2v', 3: o === 'landscape' ? '3h' : 'auto', 4: '4', 6: '6', 9: '9' } as const)[opts.per as 1] ?? 'auto';
			if (opts.title) pg.html = `<p><strong>${esc(opts.title)}</strong></p>`;
			pages.push(pg);
		}
		pg.attachments.push(newAtt(info.id, info.w, info.h, opts.fileNames ? esc(baseName(files[i])) : ''));
	}
	t.close();
	if (pages.length) { doc.insertPages(pages); toast(`Added ${pages.length} page(s)`); }
}

/** Move what doesn't fit on a page onto new pages after it. */
export function moveOverflow(pageId: string) {
	const pg = doc.pageById(pageId);
	if (!pg || pg.type !== 'content') return;
	const added = fitChain(doc.project, pg);
	if (!added.length) return toast('This page already fits.');
	doc.insertPages(added, pageId);
	doc.select(pageId);
	toast(`${added.length} page(s) added for what did not fit`);
}

/* ---------------- Word import ---------------- */
export async function startWordImport(file: File) {
	const t = toast(`Reading ${file.name}…`, 0);
	try {
		const { parseDocx } = await import('#lib/io/docxImport.ts');
		const parsed = await parseDocx(await file.arrayBuffer(), (p) => t.set(`Reading ${file.name}… ${Math.round(p * 100)}%`));
		t.close();
		if (!parsed.pages.length) return toast('No content found in that document.');
		openDialog('word', { file, parsed });
	} catch (e) {
		t.close();
		console.error(e);
		toast(`Could not read ${file.name}: ${(e as Error).message}`, 6000);
	}
}

export async function buildWordPages(parsed: DocxResult, fileName: string, opts: { skip: boolean; split: boolean; layout: 'auto' | 'free' }) {
	track('import-word');
	let from = 0;
	if (opts.skip) {
		from = 1;
		while (from < parsed.pages.length && parsed.pages[0].zeroMargins && parsed.pages[from].zeroMargins) from++;
	}
	const src = parsed.pages.slice(from);
	const t = toast('Importing…', 0);
	const cache = new Map<string, { id: string; w: number; h: number }>();
	const created: ContentPage[] = [];
	const total = src.reduce((a, p) => a + p.pics.length, 0);
	let n = 0;
	for (const p of src) {
		const pg = makeContentPage(p.landscape ? 'landscape' : 'portrait');
		pg.html = sanitize(p.html, contentWidthPx(doc.project, pg));
		pg.layout = p.pics.length ? opts.layout : 'auto';
		for (const img of p.pics) {
			t.set(`Importing pictures ${++n} of ${total}…`);
			try {
				let info = cache.get(img.path);
				if (!info) { info = await importImageFile(await parsed.loadImage(img)); cache.set(img.path, info); }
				const a = newAtt(info.id, info.w, info.h);
				const link = safeUrl(img.link);
				if (link) a.link = link;
				if (img.border) a.border = { ...img.border };
				if (pg.layout === 'free') placeFree(pg, a);
				pg.attachments.push(a);
			} catch (e) {
				console.warn('picture skipped', img.path, e);
			}
		}
		created.push(pg);
	}
	if (!created.length) { t.close(); return toast('Nothing to import.'); }
	t.set('Laying out pages…');
	let extra = 0;
	const all: ContentPage[] = [];
	for (const pg of created) {
		all.push(pg);
		if (opts.split) { const more = fitChain(doc.project, pg); extra += more.length; all.push(...more); }
	}
	doc.insertPages(all);
	t.close();
	toast(`Imported ${created.length} page(s) from ${fileName}` + (extra ? ` (+${extra} for content that did not fit)` : ''), 5000);
}
