/*
 * Pagesmith document ⇄ .docx
 *
 * Saving: every page becomes a Word section with its own size and orientation. The page background
 * goes in that section's header as a full-page picture behind the text (so Word shows the template
 * on every page), the text keeps its formatting and tables, and pictures are laid out the same way
 * (a borderless table for grids, floating pictures for manual layouts).
 * The whole Pagesmith document is also stored inside the file (a customXml part, which Word keeps),
 * so Pagesmith can open its own .docx files exactly. Pictures are not stored twice: they are matched
 * to the file's media by their SHA-256.
 */
import {
	AlignmentType, Document, Footer, Header, HorizontalPositionRelativeFrom, ImageRun, Packer, PageNumber,
	PageOrientation, Paragraph, SectionType, TextRun, TextWrappingType, VerticalAlignSection, VerticalPositionRelativeFrom,
	type FileChild, type ISectionOptions
} from 'docx';
import { htmlToContent } from 'docx/html';
import JSZip from 'jszip';
import { gridFor, pageDims, resolveBg } from '#lib/model/layout.ts';
import { labelStyle } from '#lib/model/labels.ts';
import { esc, hasText, plainText, safeUrl } from '#lib/model/sanitize.ts';
import { cleanBorder, EMU_PER_PT, lnXml } from '#lib/model/border.ts';
import type { Attachment, ContentPage, Page, Project } from '#lib/model/types.ts';
import { imageBlob, storeImage } from '#lib/state/storage.ts';
import { textHeight } from './fit';
import { cleanProject } from './legacy';

const NS = 'urn:pagesmith:v3';
const twip = (inches: number) => Math.round(inches * 1440);
const EMU = 914400;
const PX = 96;
const GAP = 0.12 * PX;

/** CSS for the page text, the same as on screen (see app.css .rt). */
const RT_CSS = `
body, p, li, td, th { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #111; }
p { margin: 0 0 0.5em; }
h1 { font-size: 16pt; font-weight: bold; margin: 0 0 0.4em; }
h2 { font-size: 13.5pt; font-weight: bold; margin: 0 0 0.4em; }
h3 { font-size: 12pt; font-weight: bold; margin: 0 0 0.35em; }
table.rt-table { border-collapse: collapse; }
table.rt-table td, table.rt-table th { border: 1px solid #444; padding: 3px 6px; vertical-align: top; }
table.rt-table th { background: #f3f0ea; font-weight: bold; }
td p, th p, li p { margin: 0; }
table.pics, table.pics td { border: none; padding: 0; }
`;

async function bytes(id: string) {
	const b = imageBlob(id);
	if (!b) return null;
	return { data: new Uint8Array(await b.arrayBuffer()), type: (b.type === 'image/png' ? 'png' : 'jpg') as 'png' | 'jpg' };
}

/** A picture filling a whole page, behind the text (for headers: backgrounds and the cover). */
async function fullPagePicture(id: string, w: number, h: number) {
	const img = await bytes(id);
	if (!img) return new Paragraph({});
	return new Paragraph({
		children: [
			new ImageRun({
				type: img.type,
				data: img.data,
				transformation: { width: w * PX, height: h * PX },
				floating: {
					horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
					verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
					behindDocument: true,
					allowOverlap: true,
					lockAnchor: true,
					wrap: { type: TextWrappingType.NONE }
				}
			})
		]
	});
}

function footerFor(project: Project, page: Page) {
	const pn = project.pageNumbers;
	if (!pn.enabled || (page.type === 'cover' && pn.skipCovers)) return new Footer({ children: [new Paragraph({})] });
	const alignment = pn.align === 'center' ? AlignmentType.CENTER : pn.align === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT;
	return new Footer({ children: [new Paragraph({ alignment, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20, font: 'Arial' })] })] });
}

/** A picture's html inside its link, when it has one (Word makes it a clickable picture). */
function linked(a: Attachment, html: string) {
	const href = safeUrl(a.link);
	return href ? `<a href="${esc(href)}">${html}</a>` : html;
}

/** The html route can't give pictures a border, so bordered ones carry a marker in their alt text
 *  that addBorders() turns into Word's picture border after the file is made. */
const BORDER_MARK = 'ps-border:';
function borderMark(a: Attachment) {
	const b = cleanBorder(a.border);
	return b ? ` alt="${BORDER_MARK}${b.w}:${b.color.slice(1)}"` : '';
}
export function addBorders(docXml: string): string {
	return docXml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) => {
		const m = d.match(new RegExp(`descr="${BORDER_MARK}([\\d.]+):([0-9a-fA-F]{6})"`));
		if (!m) return d;
		const ln = lnXml({ w: +m[1], color: '#' + m[2] });
		const mark = m[0].slice('descr="'.length, -1);
		return d.replace(new RegExp(`(name|descr)="${mark.replace(/[.]/g, '\\.')}"`, 'g'), (_, k) => (k === 'name' ? 'name="Picture"' : 'descr=""')).replace(/<a:ln\b[\s\S]*?(<\/a:ln>|\/>)/, '').replace('</pic:spPr>', ln + '</pic:spPr>');
	});
}

/** Grid pictures as an html table (sized to the space left under the text), for htmlToContent. */
function picturesTableHtml(project: Project, pg: ContentPage, areaW: number, areaH: number) {
	const { c, r } = gridFor(pg);
	const L = labelStyle(pg);
	const cellW = (areaW - (c - 1) * GAP) / c;
	const cellH = (areaH - (r - 1) * GAP) / r;
	const lbl = (k: 'title' | 'caption', html: string) => {
		const s = L[k];
		return `<p style="margin:0;text-align:${s.align};font-size:${s.size}pt;font-weight:${s.bold ? 'bold' : 'normal'};font-style:${s.italic ? 'italic' : 'normal'};color:${s.color}">${html}</p>`;
	};
	const lineH = (k: 'title' | 'caption') => (L[k].size * 1.35 * PX) / 72;
	let html = `<table class="pics" style="width:${Math.round(areaW)}px;border:none;table-layout:fixed"><colgroup>${'<col>'.repeat(c)}</colgroup>`;
	for (let row = 0; row < r; row++) {
		html += '<tr>';
		for (let col = 0; col < c; col++) {
			const a = pg.attachments[row * c + col];
			if (!a) { html += `<td style="width:${Math.round(cellW)}px"></td>`; continue; }
			const title = plainText(a.title) ? a.title : '';
			const cap = pg.showCaptions && plainText(a.caption) ? a.caption : '';
			const labelsH = (title ? lineH('title') : 0) + (cap ? lineH('caption') : 0);
			const boxW = cellW - 8, boxH = Math.max(24, cellH - labelsH - 10) * 0.96;
			const ar = a.ar || 4 / 3;
			let iw = boxW, ih = boxW / ar;
			if (ih > boxH) { ih = boxH; iw = boxH * ar; }
			// labels "on the picture" are written above / below it in Word
			const above = [title && (L.title.pos === 'above' || L.title.pos === 'top') ? lbl('title', title) : '', cap && (L.caption.pos === 'above' || L.caption.pos === 'top') ? lbl('caption', cap) : ''].join('');
			const below = [cap && (L.caption.pos === 'below' || L.caption.pos === 'bottom') ? lbl('caption', cap) : '', title && (L.title.pos === 'below' || L.title.pos === 'bottom') ? lbl('title', title) : ''].join('');
			html += `<td style="width:${Math.round(cellW)}px;vertical-align:middle;text-align:center">${above}<p style="margin:0;text-align:center">${linked(a, `<img src="ps:${a.src}" width="${Math.round(iw)}" height="${Math.round(ih)}"${borderMark(a)}>`)}</p>${below}</td>`;
		}
		html += '</tr>';
	}
	return html + '</table>';
}

async function contentSection(project: Project, pg: ContentPage, imgCache: Map<string, Uint8Array>): Promise<ISectionOptions> {
	const { w, h, land } = pageDims(project, pg);
	const bg = resolveBg(project, pg);
	const m = bg.margins;
	const safeW = (w - m.left - m.right) * PX, safeH = (h - m.top - m.bottom) * PX;

	const textHtml = hasText(pg.html) ? (pg.textAlign === 'center' ? `<div style="text-align:center">${pg.html}</div>` : pg.html) : '';
	const tH = textHtml ? textHeight(project, pg) : 0;
	const areaH = safeH - tH - (tH ? GAP : 0);

	let picsHtml = '';
	const floats: Attachment[] = [];
	if (pg.attachments.length) {
		if (pg.layout === 'free') floats.push(...pg.attachments);
		else picsHtml = picturesTableHtml(project, pg, safeW, areaH);
	}
	// tables of the text get borders (class), pictures table none
	const body = (textHtml.replace(/<table/g, '<table class="rt-table"')) || '';
	const html = pg.textV === 'bottom' && picsHtml ? picsHtml + body : body + picsHtml;

	for (const a of pg.attachments) {
		if (!imgCache.has(a.src)) { const b = await bytes(a.src); if (b) imgCache.set(a.src, b.data); }
	}
	const children: FileChild[] = html
		? [...htmlToContent(html, { stylesheet: RT_CSS, images: (src) => (src.startsWith('ps:') ? imgCache.get(src.slice(3)) : undefined), maxImageWidth: Math.round(safeW) })]
		: [];

	// manual layout: floating pictures at their exact place on the page
	if (floats.length) {
		const runs: ImageRun[] = [];
		const top = m.top * PX + tH + (tH ? GAP : 0);
		for (const a of floats) {
			const img = await bytes(a.src);
			const b = a.box;
			if (!img || !b) continue;
			let bw = b.w * safeW, bh = b.h * areaH;
			const ar = a.ar || bw / bh;
			if (pg.fit !== 'cover') { if (bw / bh > ar) bw = bh * ar; else bh = bw / ar; }
			const x = m.left * PX + b.x * safeW + (b.w * safeW - bw) / 2;
			const y = top + b.y * areaH + (b.h * areaH - bh) / 2;
			const href = safeUrl(a.link);
			runs.push(new ImageRun({
				type: img.type, data: img.data,
				...(href ? { link: href } : {}), // Word: Ctrl+click the picture opens the address
				...(a.border ? { outline: { width: Math.round(a.border.w * EMU_PER_PT), type: 'solidFill' as const, solidFillType: 'rgb' as const, value: a.border.color.slice(1).toUpperCase() } } : {}),
				transformation: { width: bw, height: bh },
				floating: {
					horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round((x / PX) * EMU) },
					verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round((y / PX) * EMU) },
					allowOverlap: true, lockAnchor: true, wrap: { type: TextWrappingType.NONE }
				}
			}));
		}
		children.push(new Paragraph({ children: runs }));
		const caps = floats.map((a) => [a.title, pg.showCaptions ? a.caption : ''].filter((x) => plainText(x)).join(' — ')).filter(Boolean);
		if (caps.length) children.push(...htmlToContent(caps.map((c) => `<p style="font-size:9pt;color:#555">${c}</p>`).join(''), { stylesheet: RT_CSS }));
	}
	if (!children.length) children.push(new Paragraph({}));

	const vAlign = !pg.attachments.length && pg.textV === 'middle' ? VerticalAlignSection.CENTER : !pg.attachments.length && pg.textV === 'bottom' ? VerticalAlignSection.BOTTOM : undefined;
	return {
		properties: {
			type: SectionType.NEXT_PAGE,
			verticalAlign: vAlign,
			page: {
				// the docx library swaps width/height itself for landscape, so it wants them in portrait order
				size: { width: twip(Math.min(w, h)), height: twip(Math.max(w, h)), orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
				margin: { top: twip(m.top), right: twip(m.right), bottom: twip(m.bottom), left: twip(m.left), header: 0, footer: twip(project.pageNumbers.bottom) }
			}
		},
		headers: { default: new Header({ children: [bg.src ? await fullPagePicture(bg.src, w, h) : new Paragraph({})] }) },
		footers: { default: footerFor(project, pg) },
		children
	};
}

async function coverSection(project: Project, pg: Page): Promise<ISectionOptions> {
	const { w, h } = pageDims(project, pg);
	return {
		properties: {
			type: SectionType.NEXT_PAGE,
			page: { size: { width: twip(w), height: twip(h), orientation: PageOrientation.PORTRAIT }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } }
		},
		headers: { default: new Header({ children: [project.template.cover ? await fullPagePicture(project.template.cover, w, h) : new Paragraph({})] }) },
		footers: { default: footerFor(project, pg) },
		children: [new Paragraph({})]
	};
}

/* ---------------- embedded Pagesmith data ---------------- */
async function sha256(data: ArrayBuffer | Uint8Array | string) {
	const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const h = await crypto.subtle.digest('SHA-256', buf as BufferSource);
	return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(s: string) {
	const b = new TextEncoder().encode(s);
	let out = '';
	for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
	return btoa(out);
}
const fromBase64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

async function embedProject(docx: Blob, project: Project): Promise<Blob> {
	const zip = await JSZip.loadAsync(docx);
	const docXml = addBorders(await zip.file('word/document.xml')!.async('string'));
	zip.file('word/document.xml', docXml);
	const images: Record<string, string> = {};
	const ids = new Set((JSON.stringify(project).match(/img_\w+/g) || []));
	for (const id of ids) { const b = imageBlob(id); if (b) images[id] = await sha256(await b.arrayBuffer()); }
	const payload = { format: 'pagesmith', version: 3, project, images, documentHash: await sha256(docXml) };

	let n = 1;
	while (zip.file(`customXml/item${n}.xml`)) n++;
	const guid = crypto.randomUUID().toUpperCase();
	zip.file(`customXml/item${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pagesmith xmlns="${NS}">${toBase64(JSON.stringify(payload))}</pagesmith>`);
	zip.file(`customXml/itemProps${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<ds:datastoreItem ds:itemID="{${guid}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${NS}"/></ds:schemaRefs></ds:datastoreItem>`);
	zip.file(`customXml/_rels/item${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${n}.xml"/></Relationships>`);
	const relsPath = 'word/_rels/document.xml.rels';
	const rels = await zip.file(relsPath)!.async('string');
	zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="rIdPagesmith${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item${n}.xml"/></Relationships>`));
	const ct = await zip.file('[Content_Types].xml')!.async('string');
	zip.file('[Content_Types].xml', ct.replace('</Types>', `<Override PartName="/customXml/itemProps${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>`));
	return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

/* ---------------- public ---------------- */
export async function buildDocx(project: Project): Promise<Blob> {
	const imgCache = new Map<string, Uint8Array>();
	const sections: ISectionOptions[] = [];
	const pn = project.pageNumbers;
	let numbered = false;
	for (const pg of project.pages) {
		const s = pg.type === 'cover' ? await coverSection(project, pg) : await contentSection(project, pg, imgCache);
		// numbering starts at the first numbered page (after the cover when the cover isn't counted)
		const counts = pg.type === 'content' || !pn.skipCovers;
		if (pn.enabled && counts && !numbered) {
			(s.properties!.page as { pageNumbers?: { start: number } }).pageNumbers = { start: pn.start };
			numbered = true;
		}
		sections.push(s);
	}
	const document = new Document({
		creator: 'Pagesmith',
		title: project.name,
		styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
		sections
	});
	return embedProject(await Packer.toBlob(document), project);
}

export interface PagesmithDocxInfo {
	project: Project;
	editedInWord: boolean;
	loadImages: () => Promise<void>;
	handle?: unknown;
}

/** If the .docx was made by Pagesmith: its document, and whether it changed in Word since. Otherwise null. */
export async function readPagesmithDocx(file: Blob): Promise<PagesmithDocxInfo | null> {
	const zip = await JSZip.loadAsync(file);
	let payload: { project: unknown; images: Record<string, string>; documentHash: string } | null = null;
	for (const name of Object.keys(zip.files)) {
		if (!/^customXml\/item\d+\.xml$/.test(name)) continue;
		const xml = await zip.file(name)!.async('string');
		if (!xml.includes(NS)) continue;
		const m = xml.match(/<pagesmith[^>]*>([\s\S]*?)<\/pagesmith>/);
		if (m) { payload = JSON.parse(fromBase64(m[1].trim())); break; }
	}
	if (!payload) return null;
	const docXml = await zip.file('word/document.xml')?.async('string');
	const editedInWord = !docXml || (await sha256(docXml)) !== payload.documentHash;
	const p = payload;
	return {
		project: cleanProject(p.project),
		editedInWord,
		async loadImages() {
			const byHash = new Map<string, JSZip.JSZipObject>();
			for (const name of Object.keys(zip.files)) if (/^word\/media\//.test(name)) {
				const data = await zip.file(name)!.async('arraybuffer');
				byHash.set(await sha256(data), zip.file(name)!);
			}
			for (const [id, hash] of Object.entries(p.images || {})) {
				const f = byHash.get(hash);
				if (!f) continue;
				const ext = f.name.split('.').pop()!.toLowerCase();
				await storeImage(new Blob([await f.async('arraybuffer')], { type: ext === 'png' ? 'image/png' : 'image/jpeg' }), id);
			}
		}
	};
}

export { esc };
