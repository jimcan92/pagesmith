/* File menu: open, save (.docx), templates, export PDF. */
import { cleanProject, cleanTemplate, FMT_TPL, isImgId } from '#lib/io/legacy.ts';
import { storeImage, imageBlob } from '#lib/state/storage.ts';
import type { Template } from '#lib/model/types.ts';
import { doc } from './doc.svelte';
import { toast } from './toasts.svelte';
import { confirmAsk, openDialog } from './ui.svelte';
import { startWordImport } from './actions';

/** Pick files with the browser's file dialog. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
	return new Promise((resolve) => {
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.accept = accept;
		inp.multiple = multiple;
		inp.onchange = () => resolve(Array.from(inp.files || []));
		inp.click();
	});
}

const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();
const blobToDataUrl = (b: Blob) =>
	new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

async function loadImagesFrom(map: Record<string, string> | undefined) {
	for (const [id, url] of Object.entries(map || {})) {
		if (!isImgId(id) || typeof url !== 'string' || !url.startsWith('data:image/')) continue;
		await storeImage(await dataUrlToBlob(url), id);
	}
}

export function download(parts: BlobPart[], name: string, type = 'application/octet-stream') {
	const url = URL.createObjectURL(new Blob(parts, { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const safeName = (s: string) => (s || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';

/* ---------------- open ---------------- */
export async function openFromDisk() {
	const [f] = await pickFiles('.docx,.json,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	if (!f) return;
	if (/\.docx$/i.test(f.name)) return openDocx(f);
	return openJson(f);
}

async function openJson(file: File) {
	try {
		const data = JSON.parse(await file.text());
		if (data.format === FMT_TPL) return toast('That is a template file — load it with Template → Import.');
		if (!data.project) throw new Error('This is not a Pagesmith file.');
		if (!(await confirmAsk(`Open “${file.name}”? The current document will be replaced (you can undo).`, 'Open'))) return;
		await loadImagesFrom(data.images);
		doc.replace(cleanProject(data.project));
		toast('Opened ' + file.name);
	} catch (e) {
		console.error(e);
		toast((e as Error).message || 'Could not open the file');
	}
}

/** A .docx: a Pagesmith-made file opens exactly; any other Word file goes through the import. */
export async function openDocx(file: File) {
	const { readPagesmithDocx } = await import('#lib/io/docxExport.ts');
	const info = await readPagesmithDocx(file).catch(() => null);
	if (!info) return startWordImport(file);
	if (info.editedInWord) {
		openDialog('docxChoice', { file, info });
		return;
	}
	await restoreFromDocx(file, info);
}

export async function restoreFromDocx(file: File, info: Awaited<ReturnType<typeof import('#lib/io/docxExport.ts').readPagesmithDocx>>) {
	if (!info) return;
	if (!(await confirmAsk(`Open “${file.name}”? The current document will be replaced (you can undo).`, 'Open'))) return;
	await info.loadImages();
	doc.replace(cleanProject(info.project));
	currentHandle = info.handle ?? null;
	toast('Opened ' + file.name);
}

/* ---------------- save (.docx) ---------------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentHandle: any = null; // File System Access handle, when the browser has one

export async function saveDocx(saveAs = false) {
	const t = toast('Saving…', 0);
	try {
		const { buildDocx } = await import('#lib/io/docxExport.ts');
		const blob = await buildDocx($state.snapshot(doc.project) as never);
		const name = safeName(doc.project.name) + '.docx';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		if (w.showSaveFilePicker) {
			try {
				if (!currentHandle || saveAs) {
					currentHandle = await w.showSaveFilePicker({
						suggestedName: name,
						types: [{ description: 'Word document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }]
					});
				}
				const s = await currentHandle.createWritable();
				await s.write(blob);
				await s.close();
				toast(`Saved ${currentHandle.name}`);
				return;
			} catch (e) {
				if ((e as Error).name === 'AbortError') return;
				console.warn('save picker failed, downloading instead', e);
			}
		}
		download([blob], name, blob.type);
		toast(`Downloaded ${name}`);
	} catch (e) {
		console.error(e);
		toast('Could not save: ' + (e as Error).message, 6000);
	} finally {
		t.close();
	}
}

/* ---------------- templates (.template.json) ---------------- */
export async function exportTemplate(T: Template) {
	const ids = [T.cover, ...T.backgrounds.map((b) => b.src)].filter(isImgId);
	const images: Record<string, string> = {};
	for (const id of ids) { const b = imageBlob(id); if (b) images[id] = await blobToDataUrl(b); }
	download([JSON.stringify({ format: FMT_TPL, version: 2, template: T, images })], safeName(T.name || 'template') + '.template.json', 'application/json');
}

export async function importTemplateFile(file?: File): Promise<Template | null> {
	const f = file ?? (await pickFiles('.json,application/json'))[0];
	if (!f) return null;
	try {
		const data = JSON.parse(await f.text());
		if (data.format !== FMT_TPL) throw new Error('This is not a template file (.template.json).');
		await loadImagesFrom(data.images);
		return cleanTemplate(data.template);
	} catch (e) {
		toast((e as Error).message);
		return null;
	}
}

/* ---------------- PDF ---------------- */
export function exportPdf() {
	doc.editingId = null;
	doc.selectedAtt = null;
	openDialog('export');
}
