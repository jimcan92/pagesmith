import { PAPER_SIZES } from './defaults';
import type { Background, Box, ContentPage, LayoutKey, Page, Project } from './types';

export const LAYOUTS: [LayoutKey, string][] = [
	['auto', 'Auto (based on count)'],
	['free', 'Manual (drag & resize)'],
	['1', '1 per page'],
	['2h', '2 side by side'],
	['2v', '2 stacked'],
	['3h', '3 in a row'],
	['3v', '3 stacked'],
	['4', '4 (2 × 2)'],
	['6', '6'],
	['9', '9 (3 × 3)']
];

/** Columns × rows of the picture grid for a page. */
export function gridFor(pg: Pick<ContentPage, 'attachments' | 'orientation' | 'layout'>) {
	const n = pg.attachments.length;
	const land = pg.orientation === 'landscape';
	let c: number, r: number;
	switch (pg.layout) {
		case '1': c = 1; r = 1; break;
		case '2h': c = 2; r = 1; break;
		case '2v': c = 1; r = 2; break;
		case '3h': c = 3; r = 1; break;
		case '3v': c = 1; r = 3; break;
		case '4': c = 2; r = 2; break;
		case '6': c = land ? 3 : 2; r = land ? 2 : 3; break;
		case '9': c = 3; r = 3; break;
		default:
			if (n <= 1) { c = 1; r = 1; }
			else if (n === 2) { c = land ? 2 : 1; r = land ? 1 : 2; }
			else if (n === 3) { c = land ? 3 : 2; r = land ? 1 : 2; }
			else if (n === 4) { c = 2; r = 2; }
			else if (n <= 6) { c = land ? 3 : 2; r = land ? 2 : 3; }
			else if (n <= 9) { c = 3; r = 3; }
			else { c = land ? 4 : 3; r = Math.ceil(n / c); }
	}
	if (n > c * r) r = Math.ceil(n / c);
	return { c, r };
}

/** Page size in inches. Covers are always portrait. */
export function pageDims(project: Project, pg: Page) {
	const paper = PAPER_SIZES[project.paper] || PAPER_SIZES.long;
	const land = pg.type === 'content' && pg.orientation === 'landscape';
	return land ? { w: paper.h, h: paper.w, land } : { w: paper.w, h: paper.h, land };
}

export const bgById = (project: Project, id: string) => project.template.backgrounds.find((b) => b.id === id);

/** The background actually used by a content page. */
export function resolveBg(project: Project, pg: ContentPage): Background {
	const base = bgById(project, pg.orientation) ?? {
		id: pg.orientation, name: pg.orientation, orientation: pg.orientation, src: '',
		margins: { top: 1, right: 1, bottom: 1, left: 1 }
	};
	if (pg.bg === 'none') return { ...base, src: '' };
	const b = bgById(project, pg.bg);
	return b && b.orientation === pg.orientation ? b : base;
}

export function bgLabel(project: Project, pg: ContentPage) {
	if (pg.bg === 'none') return 'No background';
	const b = bgById(project, pg.bg);
	return b && b.orientation === pg.orientation ? b.name : bgById(project, pg.orientation)?.name || pg.orientation;
}

/** Width of the text area in px (for tables). */
export function contentWidthPx(project: Project, pg: ContentPage) {
	const { w } = pageDims(project, pg);
	const m = resolveBg(project, pg).margins;
	return Math.round((w - m.left - m.right) * 96);
}

export function pageNumbers(project: Project): Record<string, number> {
	const pn = project.pageNumbers;
	const out: Record<string, number> = {};
	let n = pn.start || 1;
	for (const pg of project.pages) {
		if (pg.type === 'cover' && pn.skipCovers) continue;
		out[pg.id] = n++;
	}
	return out;
}

/* ---------------- manual layout boxes (fractions of the attachment area) ---------------- */
export const MIN_FRAC = 0.04;
export const SNAP = 0.012;

export const cascadeBox = (i: number): Box => ({ x: 0.05 + 0.05 * (i % 6), y: 0.05 + 0.05 * (i % 6), w: 0.4, h: 0.4 });

export function clampBox(b: Box): Box {
	b.w = Math.min(1, Math.max(MIN_FRAC, b.w));
	b.h = Math.min(1, Math.max(MIN_FRAC, b.h));
	b.x = Math.min(1 - b.w, Math.max(0, b.x));
	b.y = Math.min(1 - b.h, Math.max(0, b.y));
	return b;
}

/** A box `w` wide that keeps the picture shape (`ar`) in an area of aspect `areaAspect`, centered at (cx, cy). */
export function boxForAspect(areaAspect: number, ar: number, w: number, cx = 0.5, cy = 0.5): Box {
	let h = (w * areaAspect) / (ar || 4 / 3);
	if (h > 1) { w = w / h; h = 1; }
	if (w > 1) { h = h / w; w = 1; }
	const x = Math.min(Math.max(0, cx - w / 2), 1 - w);
	const y = Math.min(Math.max(0, cy - h / 2), 1 - h);
	return { x, y, w, h };
}

/** Pull a moving box onto the area edges / center lines when it's close. */
export function snapMove(b: Box): Box {
	const xs: [number, number][] = [[b.x, 0], [b.x + b.w / 2, 0.5], [b.x + b.w, 1]];
	for (const [v, t] of xs) if (Math.abs(v - t) < SNAP) { b.x += t - v; break; }
	const ys: [number, number][] = [[b.y, 0], [b.y + b.h / 2, 0.5], [b.y + b.h, 1]];
	for (const [v, t] of ys) if (Math.abs(v - t) < SNAP) { b.y += t - v; break; }
	return b;
}

/** Approximate area aspect (width / height) of a page's attachment area, from its safe area. */
export function areaAspectFromMargins(project: Project, pg: ContentPage) {
	const { w, h } = pageDims(project, pg);
	const m = resolveBg(project, pg).margins;
	return (w - m.left - m.right) / Math.max(0.5, h - m.top - m.bottom);
}
