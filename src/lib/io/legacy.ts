/* Validation of documents/templates coming from files or storage (also the old Pagesmith formats). */
import { blankTemplate, makeContentPage, uid } from '#lib/model/defaults.ts';
import { cleanLabels } from '#lib/model/labels.ts';
import { LAYOUTS } from '#lib/model/layout.ts';
import { safeUrl, sanitize, sanitizeInline } from '#lib/model/sanitize.ts';
import { clampBox } from '#lib/model/layout.ts';
import type { Attachment, Background, Margins, Page, PaperKey, Project, Template } from '#lib/model/types.ts';
import { PAPER_SIZES } from '#lib/model/defaults.ts';

export const FMT_DOC_V2 = 'pagesmith';
export const FMT_TPL = 'pagesmith-template';

export const isImgId = (ref: unknown): ref is string => typeof ref === 'string' && /^img_\w+$/.test(ref);
const okSrc = (s: unknown) => (isImgId(s) ? s : '');
const num = (v: unknown, d: number) => (Number.isFinite(+(v as number)) ? Math.max(0, Math.min(10, +(v as number))) : d);
const cleanMargins = (m: Partial<Margins> | undefined, d: Margins): Margins => ({
	top: num(m?.top, d.top), right: num(m?.right, d.right), bottom: num(m?.bottom, d.bottom), left: num(m?.left, d.left)
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function cleanTemplate(t: Any): Template {
	t = t || {};
	const defs = blankTemplate().backgrounds;
	const bgs: Any[] = Array.isArray(t.backgrounds) ? t.backgrounds : [];
	const out: Template = { name: String(t.name || 'Template'), cover: okSrc(t.cover), backgrounds: [] };
	for (const d of defs) {
		const b = bgs.find((x) => x && x.id === d.id) || {};
		out.backgrounds.push({ id: d.id, name: d.name, orientation: d.orientation, src: okSrc(b.src), margins: cleanMargins(b.margins, d.margins) });
	}
	for (const b of bgs) {
		if (!b || b.id === 'portrait' || b.id === 'landscape' || !/^bg_\w+$/.test(String(b.id))) continue;
		out.backgrounds.push({
			id: String(b.id), name: String(b.name || 'Special'), orientation: b.orientation === 'landscape' ? 'landscape' : 'portrait',
			src: okSrc(b.src), margins: cleanMargins(b.margins, defs[0].margins)
		} satisfies Background);
	}
	return out;
}

export function cleanAttachment(a: Any): Attachment | null {
	const src = okSrc(a?.src);
	if (!src) return null;
	const out: Attachment = { id: String(a.id || uid('att')), src, title: sanitizeInline(a.title || ''), caption: sanitizeInline(a.caption || '') };
	if (Number.isFinite(+a.ar) && +a.ar > 0) out.ar = +a.ar;
	if (a.box && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(+a.box[k]))) out.box = clampBox({ x: +a.box.x, y: +a.box.y, w: +a.box.w, h: +a.box.h });
	const link = safeUrl(a.link);
	if (link) out.link = link;
	return out;
}

/** Any document object (v2 app, old v1 app, or this app) → a safe Project. */
export function cleanProject(p: Any): Project {
	p = p || {};
	const out: Project = {
		format: 'pagesmith', version: 3, name: String(p.name || 'Untitled document'),
		paper: (PAPER_SIZES as Any)[p.paper] ? (p.paper as PaperKey) : 'long',
		pageNumbers: { enabled: false, align: 'right', bottom: 0.3, side: 0.6, skipCovers: true, start: 1, ...(p.pageNumbers || {}) },
		template: cleanTemplate(p.template),
		pages: []
	};
	out.pageNumbers.enabled = !!out.pageNumbers.enabled;
	let cover = false;
	for (const pg of (p.pages || []) as Any[]) {
		if (pg?.type === 'cover') {
			if (!cover) out.pages.push({ id: String(pg.id || uid('pg')), type: 'cover' });
			cover = true;
			continue;
		}
		const page: Page = {
			id: String(pg?.id || uid('pg')), type: 'content',
			orientation: pg?.orientation === 'landscape' ? 'landscape' : 'portrait',
			bg: typeof pg?.bg === 'string' && /^(default|none|bg_\w+|portrait|landscape)$/.test(pg.bg) ? pg.bg : 'default',
			html: sanitize(pg?.html || ''),
			layout: LAYOUTS.some(([v]) => v === pg?.layout) ? pg.layout : 'auto',
			fit: pg?.fit === 'cover' ? 'cover' : 'contain',
			showCaptions: pg?.showCaptions !== false,
			textV: ['middle', 'bottom'].includes(pg?.textV) ? pg.textV : 'top',
			textAlign: pg?.textAlign === 'center' ? 'center' : '',
			labels: cleanLabels(pg?.labels),
			attachments: ((pg?.attachments || []) as Any[]).map(cleanAttachment).filter((a): a is Attachment => !!a)
		};
		out.pages.push(page);
	}
	const i = out.pages.findIndex((x) => x.type === 'cover');
	if (i > 0) out.pages.unshift(out.pages.splice(i, 1)[0]);
	if (!out.pages.length) out.pages.push(makeContentPage());
	return out;
}
