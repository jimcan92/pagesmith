/* Cleaning of html that comes from the editor, from pasting (Word, Google Docs, web) or from files. */

const ALLOWED = new Set([
	'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4',
	'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'BLOCKQUOTE',
	'SUB', 'SUP', 'FONT', 'HR', 'MARK', 'A'
]);

/**
 * A link address that is safe to keep: web, e-mail and phone links only (never javascript: and the like).
 * "www.site.com" or "site.com/page" get https:// in front, like Word does. Anything else → ''.
 */
export function safeUrl(v: string | null | undefined): string {
	let s = String(v ?? '').trim();
	if (!s || /\s/.test(s.replace(/ /g, '%20'))) return '';
	s = s.replace(/ /g, '%20');
	if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(s)) s = 'mailto:' + s;
	else if (!/^[a-z][a-z\d+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+([/?#:].*)?$/.test(s)) s = 'https://' + s;
	try {
		const u = new URL(s);
		return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? s : '';
	} catch {
		return '';
	}
}
export const DROP = new Set([
	'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'META', 'LINK',
	'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'FORM', 'CANVAS'
]);
const STYLES = [
	'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color',
	'background-color', 'font-size', 'font-family', 'margin-left', 'padding-left'
];

/** "283.5pt", "2in", "120" (px) or "25%" → { px } or { pct }. */
export function parseWidth(v: string | null | undefined): { px?: number; pct?: number } | null {
	const m = String(v || '').trim().match(/^([\d.]+)\s*(px|pt|in|cm|mm|%)?$/i);
	if (!m || !(+m[1] > 0)) return null;
	const n = +m[1];
	const u = (m[2] || 'px').toLowerCase();
	if (u === '%') return { pct: n };
	const k: Record<string, number> = { px: 1, pt: 96 / 72, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
	return { px: n * k[u] };
}

const span = (c: Element) => +(c.getAttribute('colspan') || 1) || 1;
const rspan = (c: Element) => Math.max(1, +(c.getAttribute('rowspan') || 1) || 1);

/** The first grid column of every cell, skipping columns taken by cells that span down from rows above. */
export function cellColumns(rows: HTMLTableRowElement[]): Map<Element, number> {
	const start = new Map<Element, number>();
	const taken: number[][] = rows.map(() => []); // taken[r][c] = 1 when a rowspan from above covers it
	rows.forEach((r, ri) => {
		let col = 0;
		for (const c of Array.from(r.cells)) {
			while (taken[ri][col]) col++;
			start.set(c, col);
			for (let dr = 1; dr < rspan(c) && ri + dr < rows.length; dr++)
				for (let k = 0; k < span(c); k++) taken[ri + dr][col + k] = 1;
			col += span(c);
		}
	});
	return start;
}

/**
 * Keep column widths: from Word/Google Docs (cell or <col> widths) or from the editor
 * (`colwidth` on cells). Result: cells carry `colwidth` in px for a table `widthPx` wide,
 * so the editor (TipTap) and the page show the same columns.
 */
export function fixTableColumns(table: HTMLTableElement, widthPx = 0) {
	const rows = Array.from(table.rows);
	const startCol = cellColumns(rows);
	const nCols = Math.max(0, ...Array.from(startCol, ([c, i]) => i + span(c)));
	if (!nCols) return;
	let widths: ({ px?: number; pct?: number } | null)[] | null = null;

	// 1. the editor's own widths (any cell can tell the width of the grid columns it covers)
	{
		const ws: ({ px: number } | null)[] = Array(nCols).fill(null);
		for (const [c, col] of startCol) {
			const cw = (c.getAttribute('colwidth') || '').split(',').map((x) => parseInt(x, 10));
			for (let k = 0; k < span(c); k++) if (cw[k] > 0 && !ws[col + k]) ws[col + k] = { px: cw[k] };
		}
		if (ws.every(Boolean)) widths = ws;
	}
	// 2. <col> widths
	if (!widths) {
		const ws: ({ px?: number; pct?: number } | null)[] = [];
		table.querySelectorAll('col').forEach((c) => {
			const w = parseWidth((c as HTMLElement).dataset.w || c.getAttribute('width') || (c as HTMLElement).style?.width);
			for (let k = 0; k < (+(c.getAttribute('span') || 1) || 1); k++) ws.push(w);
		});
		if (ws.length === nCols && ws.every(Boolean)) widths = ws;
	}
	// 3. the first row whose cells all say how wide they are
	if (!widths) {
		for (const r of rows) {
			const ws: ({ px?: number; pct?: number })[] = [];
			let ok = true;
			for (const c of Array.from(r.cells)) {
				const w = parseWidth((c as HTMLElement).dataset.w);
				if (!w) { ok = false; break; }
				for (let k = 0; k < span(c); k++) ws.push(w.pct != null ? { pct: w.pct / span(c) } : { px: (w.px || 0) / span(c) });
			}
			if (ok && ws.length === nCols) { widths = ws; break; }
		}
	}
	table.querySelectorAll('colgroup, col').forEach((c) => c.remove());
	table.querySelectorAll('[data-w]').forEach((c) => c.removeAttribute('data-w'));
	table.removeAttribute('style');
	for (const c of Array.from(table.querySelectorAll('td, th'))) c.removeAttribute('colwidth');
	if (!widths) return;

	const vals = widths.map((w) => (w!.pct != null ? w!.pct! : w!.px!));
	const total = vals.reduce((a, b) => a + b, 0) || 1;
	const allPx = widths.every((w) => w!.px != null);
	// px widths that already fit stay as they are; otherwise scale to the available width
	const target = widthPx || (allPx ? total : 624);
	const px = vals.map((v) => Math.max(20, Math.round((allPx && total <= target + 1 ? v : (v / total) * target))));
	for (const [c, col] of startCol) c.setAttribute('colwidth', px.slice(col, col + span(c)).join(','));
	// a matching <colgroup> so the page (and print) shows the same columns as the editor
	const d = table.ownerDocument;
	const cg = d.createElement('colgroup');
	px.forEach((w) => { const c = d.createElement('col'); c.setAttribute('style', `width:${w}px`); cg.appendChild(c); });
	table.insertBefore(cg, table.firstChild);
	table.setAttribute('style', `width:${px.reduce((a, b) => a + b, 0)}px;table-layout:fixed`);
}

/** Clean html for the page text. `tableWidthPx` = the width tables should fill. */
export function sanitize(html: string, tableWidthPx = 0): string {
	const doc = new DOMParser().parseFromString('<div id="r">' + (html || '') + '</div>', 'text/html');
	const root = doc.getElementById('r')!;
	(function walk(node: Element) {
		for (const ch of Array.from(node.childNodes)) {
			if (ch.nodeType === 8) { ch.remove(); continue; }
			if (ch.nodeType !== 1) continue;
			const el = ch as HTMLElement;
			const tag = el.tagName.toUpperCase(); // Word's <o:p> etc. are not allowed → unwrapped
			if (DROP.has(tag)) { el.remove(); continue; }
			walk(el);
			if (!ALLOWED.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); continue; }
			const keep: Record<string, string> = {};
			for (const prop of STYLES) {
				const v = el.style.getPropertyValue(prop);
				if (v && !/url\(|expression/i.test(v)) keep[prop] = v;
			}
			const extra: Record<string, string> = {};
			if (tag === 'TD' || tag === 'TH') {
				for (const a of ['colspan', 'rowspan', 'colwidth']) if (el.hasAttribute(a)) extra[a] = el.getAttribute(a)!;
			}
			if (tag === 'TD' || tag === 'TH' || tag === 'COL') {
				const w = el.style.width || el.getAttribute('width');
				if (w) extra['data-w'] = w;
				if (tag === 'COL' && el.getAttribute('span')) extra.span = el.getAttribute('span')!;
			}
			if (tag === 'FONT') for (const a of ['color', 'size']) if (el.hasAttribute(a)) extra[a] = el.getAttribute(a)!;
			if (tag === 'A') {
				const href = safeUrl(el.getAttribute('href'));
				// anchors without a usable address (bookmarks, javascript:) are just text
				if (!href) { el.replaceWith(...Array.from(el.childNodes)); continue; }
				Object.assign(extra, { href, target: '_blank', rel: 'noopener noreferrer nofollow' });
			}
			if (el.getAttribute('align')) keep['text-align'] = el.getAttribute('align')!;
			for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
			Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
			const st = Object.entries(keep).map(([k, v]) => `${k}:${v}`).join(';');
			if (st) el.setAttribute('style', st);
		}
	})(root);
	root.querySelectorAll('table').forEach((t) => fixTableColumns(t as HTMLTableElement, tableWidthPx));
	return root.innerHTML;
}

/** Titles & captions only keep bold / italic / underline / line breaks. */
export function sanitizeInline(html: string): string {
	const doc = new DOMParser().parseFromString('<div id="r">' + (html || '') + '</div>', 'text/html');
	const root = doc.getElementById('r')!;
	const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR']);
	(function walk(node: Element) {
		for (const ch of Array.from(node.childNodes)) {
			if (ch.nodeType === 8) { ch.remove(); continue; }
			if (ch.nodeType !== 1) continue;
			const el = ch as HTMLElement;
			if (DROP.has(el.tagName.toUpperCase())) { el.remove(); continue; }
			walk(el);
			const tag = el.tagName.toUpperCase();
			if (!OK.has(tag)) {
				const block = /^(DIV|P|LI)$/.test(tag) && el.previousSibling;
				el.replaceWith(...(block ? [doc.createElement('br')] : []), ...Array.from(el.childNodes));
				continue;
			}
			for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
		}
	})(root);
	return root.innerHTML.replace(/(<br>\s*)+$/i, '');
}

export const plainText = (html: string) =>
	String(html || '')
		.replace(/<\/(p|h\d|li|td|th|div)>/gi, ' ')
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export const esc = (s: unknown) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** True when the html shows something (text, a table or a line). */
export const hasText = (html: string) =>
	(html || '').replace(/<[^>]*>|&nbsp;|\s/g, '') !== '' || /<table|<hr/i.test(html || '');
