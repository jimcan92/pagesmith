import type { Box } from './types';

/**
 * Ready-made picture arrangements. Each one turns the pictures' shapes (width / height) and the
 * attachment area's aspect (width / height) into manual-layout boxes (fractions of the area),
 * so the user can keep adjusting them by hand afterwards.
 */
export type PresetKey = 'stagger' | 'mosaic' | 'masonry' | 'featureTop' | 'featureLeft' | 'zigzag' | 'spotlight';

export const PRESETS: [PresetKey, string, string][] = [
	['stagger', 'Staggered', 'Corner to corner, slightly overlapping (good for 2 documents)'],
	['mosaic', 'Mosaic', 'Rows that fill the page, no cropping'],
	['masonry', 'Columns', 'Pictures stacked in balanced columns'],
	['featureTop', 'Big on top', 'First picture big, the rest in a row below'],
	['featureLeft', 'Big on left', 'First picture big, the rest in a column at the side'],
	['zigzag', 'Zigzag', 'Alternating left and right'],
	['spotlight', 'Spotlight', 'First picture centered, the rest small around the bottom']
];

const GAP = 0.025;
const DEF_AR = 4 / 3;

interface Slot { x: number; y: number; w: number; h: number }

/** Largest box with the picture's shape inside `s`, placed by anchor (0 = left/top, 1 = right/bottom). */
function fitIn(s: Slot, ar: number, A: number, ax = 0.5, ay = 0.5): Box {
	// in fraction units a picture of shape ar has  w * A / h = ar
	let w = s.w, h = (w * A) / ar;
	if (h > s.h) { h = s.h; w = (h * ar) / A; }
	return { x: s.x + (s.w - w) * ax, y: s.y + (s.h - h) * ay, w, h };
}

/** Equal cells filling `s`, `n` pictures, `cols` columns. */
function gridSlots(s: Slot, n: number, cols: number): Slot[] {
	const rows = Math.ceil(n / cols);
	const cw = (s.w - GAP * (cols - 1)) / cols, ch = (s.h - GAP * (rows - 1)) / rows;
	return Array.from({ length: n }, (_, i) => ({ x: s.x + (i % cols) * (cw + GAP), y: s.y + Math.floor(i / cols) * (ch + GAP), w: cw, h: ch }));
}

function stagger(ars: number[], A: number): Box[] {
	const n = ars.length;
	if (n === 1) return [fitIn({ x: 0, y: 0, w: 1, h: 1 }, ars[0], A)];
	const s = n === 2 ? 0.64 : Math.max(0.36, 0.64 - 0.07 * (n - 2));
	const step = (1 - s) / (n - 1);
	return ars.map((ar, i) => {
		const t = i / (n - 1);
		return fitIn({ x: step * i, y: step * i, w: s, h: s }, ar, A, t, t);
	});
}

/** Justified rows: every row as tall as it can be so it spans the width, then the whole thing scaled to fit. */
function mosaic(ars: number[], A: number): Box[] {
	const n = ars.length;
	const g = GAP * A; // gaps in real units (area height = 1, width = A)
	let best: Box[] = [], bestCover = -1;
	for (let r = 1; r <= n; r++) {
		const rows: number[][] = [];
		for (let k = 0, i = 0; k < r; k++) {
			const cnt = Math.round((n - i) / (r - k));
			rows.push(ars.slice(i, i + cnt).map((_, j) => i + j));
			i += cnt;
		}
		const hs = rows.map((row) => (A - g * (row.length - 1)) / row.reduce((t, j) => t + ars[j], 0));
		const total = hs.reduce((t, h) => t + h, 0) + GAP * (r - 1);
		const sc = Math.min(1, 1 / total);
		const out: Box[] = [];
		let y = (1 - total * sc) / 2;
		rows.forEach((row, k) => {
			const h = hs[k] * sc;
			const rowW = (row.reduce((t, j) => t + ars[j] * hs[k], 0) + g * (row.length - 1)) * sc;
			let x = (A - rowW) / 2;
			for (const j of row) {
				const w = ars[j] * h;
				out[j] = { x: x / A, y, w: w / A, h };
				x += w + g * sc;
			}
			y += h + GAP * sc;
		});
		const cover = sc * sc * hs.reduce((t, h, k) => t + h * (A - g * (rows[k].length - 1)), 0);
		if (cover > bestCover) { bestCover = cover; best = out; }
	}
	return best;
}

/** Balanced columns (each picture goes into the shortest column). */
function masonry(ars: number[], A: number): Box[] {
	const n = ars.length;
	const g = GAP * A;
	let best: Box[] = [], bestCover = -1;
	for (let c = 1; c <= Math.min(n, 4); c++) {
		const cw = (A - g * (c - 1)) / c;
		const heights = new Array(c).fill(0);
		const place: { col: number; y: number; h: number }[] = [];
		ars.forEach((ar) => {
			const col = heights.indexOf(Math.min(...heights));
			const h = cw / ar;
			place.push({ col, y: heights[col], h });
			heights[col] += h + GAP;
		});
		const total = Math.max(...heights) - GAP;
		const sc = Math.min(1, 1 / total);
		const x0 = (A - A * sc) / 2;
		const out = place.map((p) => ({ x: (x0 + p.col * (cw + g) * sc) / A, y: (1 - total * sc) / 2 + p.y * sc, w: (cw * sc) / A, h: p.h * sc }));
		const cover = sc * sc * place.reduce((t, p) => t + p.h * cw, 0);
		if (cover > bestCover + 1e-6) { bestCover = cover; best = out; }
	}
	return best;
}

function featureTop(ars: number[], A: number): Box[] {
	const n = ars.length;
	if (n === 1) return [fitIn({ x: 0, y: 0, w: 1, h: 1 }, ars[0], A)];
	const rest = n - 1, cols = Math.min(rest, A > 1 ? 5 : 4), rows = Math.ceil(rest / cols);
	const topH = rows > 1 ? 0.55 : 0.64;
	const out = [fitIn({ x: 0, y: 0, w: 1, h: topH }, ars[0], A, 0.5, 0)];
	gridSlots({ x: 0, y: topH + GAP, w: 1, h: 1 - topH - GAP }, rest, cols).forEach((s, i) => out.push(fitIn(s, ars[i + 1], A, 0.5, 0)));
	return out;
}

function featureLeft(ars: number[], A: number): Box[] {
	const n = ars.length;
	if (n === 1) return [fitIn({ x: 0, y: 0, w: 1, h: 1 }, ars[0], A)];
	const rest = n - 1, cols = rest > 4 ? 2 : 1;
	const leftW = cols > 1 ? 0.56 : 0.64;
	const out = [fitIn({ x: 0, y: 0, w: leftW, h: 1 }, ars[0], A, 1, 0.5)];
	gridSlots({ x: leftW + GAP, y: 0, w: 1 - leftW - GAP, h: 1 }, rest, cols).forEach((s, i) => out.push(fitIn(s, ars[i + 1], A, 0, 0.5)));
	return out;
}

function zigzag(ars: number[], A: number): Box[] {
	const n = ars.length;
	const h = (1 - GAP * (n - 1)) / n, w = n === 1 ? 1 : 0.62;
	return ars.map((ar, i) => {
		const left = i % 2 === 0;
		return fitIn({ x: left ? 0 : 1 - w, y: i * (h + GAP), w, h }, ar, A, left ? 0 : 1, 0.5);
	});
}

function spotlight(ars: number[], A: number): Box[] {
	const n = ars.length;
	if (n === 1) return [fitIn({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, ars[0], A)];
	const rest = n - 1, cols = Math.min(rest, 4), rows = Math.ceil(rest / cols);
	const bottomH = Math.min(0.42, 0.22 * rows);
	const out = [fitIn({ x: 0.08, y: 0, w: 0.84, h: 1 - bottomH - GAP * 2 }, ars[0], A, 0.5, 0.5)];
	const sw = Math.min(1, cols * 0.3);
	gridSlots({ x: (1 - sw) / 2, y: 1 - bottomH, w: sw, h: bottomH }, rest, cols).forEach((s, i) => out.push(fitIn(s, ars[i + 1], A, 0.5, 0.5)));
	return out;
}

const FNS: Record<PresetKey, (ars: number[], A: number) => Box[]> = { stagger, mosaic, masonry, featureTop, featureLeft, zigzag, spotlight };

/** Boxes for `ars` (picture shapes) in an area whose width / height is `areaAspect`. */
export function presetBoxes(key: PresetKey, ars: (number | undefined)[], areaAspect: number): Box[] {
	if (!ars.length) return [];
	const A = areaAspect > 0 ? areaAspect : 0.75;
	return FNS[key](ars.map((a) => (a && a > 0 ? a : DEF_AR)), A).map((b) => ({
		x: Math.max(0, Math.min(1, b.x)), y: Math.max(0, Math.min(1, b.y)), w: Math.min(1, b.w), h: Math.min(1, b.h)
	}));
}
