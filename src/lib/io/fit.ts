/* Measuring page text off-screen, and moving what doesn't fit onto a new page. */
import { makeContentPage } from '#lib/model/defaults.ts';
import { pageDims, resolveBg } from '#lib/model/layout.ts';
import { sanitize } from '#lib/model/sanitize.ts';
import type { ContentPage, Project } from '#lib/model/types.ts';

const PX = 96;
let box: HTMLDivElement | null = null;

/** A hidden copy of a page's safe area to measure text in. */
function measurer(widthPx: number) {
	if (!box) {
		box = document.createElement('div');
		box.setAttribute('aria-hidden', 'true');
		box.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
		document.body.appendChild(box);
	}
	box.style.width = widthPx + 'px';
	return box;
}

export function safeSize(project: Project, pg: ContentPage) {
	const { w, h } = pageDims(project, pg);
	const m = resolveBg(project, pg).margins;
	return { w: (w - m.left - m.right) * PX, h: (h - m.top - m.bottom) * PX };
}

/** Height (px) the html takes on this page. */
export function textHeight(project: Project, pg: ContentPage, html = pg.html) {
	const { w } = safeSize(project, pg);
	const b = measurer(w);
	b.innerHTML = `<div class="rt"${pg.textAlign === 'center' ? ' style="text-align:center"' : ''}>${html}</div>`;
	return (b.firstElementChild as HTMLElement).offsetHeight;
}

/** Is a page too full? Returns a message or ''. */
export function overflowMessage(project: Project, pg: ContentPage): string {
	if (!pg.html) return '';
	const { h } = safeSize(project, pg);
	const th = textHeight(project, pg);
	if (th > h + 2) return 'Too much text for this page';
	if (pg.attachments.length && th > h * 0.8) return 'Pictures are very small — move some text or pictures to another page';
	return '';
}

/** Does a table row look like a header row? (th cells, all shaded, or all bold) */
export function isHeaderRow(tr: HTMLTableRowElement) {
	const cells = Array.from(tr.cells);
	if (!cells.length) return false;
	if (cells.every((c) => c.tagName === 'TH')) return true;
	if (cells.every((c) => /background-color/i.test(c.getAttribute('style') || ''))) return true;
	const filled = cells.filter((c) => c.textContent!.trim());
	return filled.length > 0 && filled.every((c) => {
		const bold = Array.from(c.querySelectorAll('b, strong')).map((b) => b.textContent).join('').replace(/\s/g, '');
		return bold.length >= c.textContent!.replace(/\s/g, '').length * 0.9;
	});
}

/**
 * Split a page's text so the first part fits; returns [kept, moved] html or null if nothing can move.
 * Trailing blocks move first; a table at the end gives up rows (its header row is repeated, and a
 * header is never left behind with fewer than two of its rows).
 */
export function splitHtml(project: Project, pg: ContentPage, maxH: number): [string, string] | null {
	const holder = document.createElement('div');
	holder.innerHTML = pg.html;
	const out = document.createElement('div');
	let contTable: HTMLTableElement | null = null, moved = false, guard = 0;
	const fits = () => textHeight(project, pg, holder.innerHTML) <= maxH + 2;
	while (guard++ < 500 && !fits()) {
		[...holder.childNodes].filter((n) => n.nodeType === 3 && !n.textContent!.trim()).forEach((n) => n.remove());
		const last = holder.lastElementChild as HTMLElement | null;
		if (!last) break;
		const table = last.tagName === 'TABLE' ? (last as HTMLTableElement) : null;
		const rows = table ? Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)) : [];
		const headLike = !!table && !table.tHead && rows.length > 0 && isHeaderRow(rows[0]);
		const keep = headLike ? 3 : table?.tHead ? 2 : 1;
		if (table && rows.length > keep) {
			if (!contTable) {
				contTable = table.cloneNode(false) as HTMLTableElement;
				const cg = table.querySelector('colgroup');
				if (cg) contTable.appendChild(cg.cloneNode(true));
				if (table.tHead) contTable.appendChild(table.tHead.cloneNode(true));
				else if (headLike) { const th = document.createElement('thead'); th.appendChild(rows[0].cloneNode(true)); contTable.appendChild(th); }
				contTable.appendChild(document.createElement('tbody'));
				out.insertBefore(contTable, out.firstChild);
			}
			const body = contTable.tBodies[0];
			body.insertBefore(rows[rows.length - 1], body.firstChild);
			const rem = rows.slice(0, -1);
			while (rem.length > keep && isHeaderRow(rem[rem.length - 1])) body.insertBefore(rem.pop()!, body.firstChild);
		} else if (table && contTable && rows.length) {
			const body = contTable.tBodies[0];
			rows.slice(headLike ? 1 : 0).reverse().forEach((r) => body.insertBefore(r, body.firstChild));
			table.remove();
			contTable = null;
		} else {
			if (holder.children.length === 1 && !moved) break; // one block too big: leave it
			contTable = null;
			out.insertBefore(last, out.firstChild);
		}
		moved = true;
	}
	if (!moved || !out.innerHTML.trim()) return null;
	return [holder.innerHTML, out.innerHTML];
}

/**
 * Make one page fit. Returns the new pages to insert after it (in order), or [] if it already fits.
 * Text + pictures that don't fit together: the pictures get their own page.
 */
export function fitPage(project: Project, pg: ContentPage): ContentPage[] {
	const { w, h } = safeSize(project, pg);
	const th = pg.html ? textHeight(project, pg) : 0;
	const added: ContentPage[] = [];
	const cont = () => {
		const np = makeContentPage(pg.orientation, pg.bg);
		np.textAlign = pg.textAlign;
		// pg is usually reactive state (a proxy), which structuredClone can't copy
		np.labels = pg.labels ? JSON.parse(JSON.stringify(pg.labels)) : undefined;
		return np;
	};
	if (pg.attachments.length && pg.html && th > h * 0.55) {
		const pics = cont();
		pics.layout = pg.layout === 'free' ? 'auto' : pg.layout;
		pics.attachments = pg.attachments.map((a) => ({ ...a, box: undefined }));
		pg.attachments = [];
		added.push(pics);
	}
	if (th > h + 2) {
		const parts = splitHtml(project, pg, h);
		if (parts) {
			// build the new page first, so a failure can never leave the moved text nowhere
			const np = cont();
			np.html = sanitize(parts[1], w);
			pg.html = sanitize(parts[0], w);
			added.unshift(np); // text continues before the pictures page
		}
	}
	return added;
}

/** Fit a page and keep fitting the pages it creates. Returns all new pages, in order. */
export function fitChain(project: Project, pg: ContentPage): ContentPage[] {
	const all: ContentPage[] = [];
	let queue = fitPage(project, pg);
	let guard = 0;
	while (queue.length && guard++ < 60) {
		const [first, ...rest] = queue;
		all.push(first);
		const more = fitPage(project, first);
		queue = [...more, ...rest];
	}
	return all;
}
