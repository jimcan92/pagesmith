import type { ContentPage } from '#lib/model/types.ts';

/**
 * Give every picture of a grid page a manual-layout box where it is now on screen, so switching
 * to Manual doesn't move anything. Returns the picture area's on-screen rectangle (or null).
 */
export function boxesFromScreen(pg: ContentPage): DOMRect | null {
	const area = document.querySelector(`.canvas-scroll .page-slot[data-page-id="${pg.id}"] .grid-area`) as HTMLElement | null;
	if (!area) return null;
	const gr = area.getBoundingClientRect();
	area.querySelectorAll('figure').forEach((fig) => {
		const at = pg.attachments[+(fig as HTMLElement).dataset.i!];
		if (!at) return;
		const r = fig.querySelector('.imgbox')!.getBoundingClientRect();
		let w = r.width, h = r.height;
		if (at.ar && pg.fit !== 'cover') { if (w / h > at.ar) w = h * at.ar; else h = w / at.ar; }
		const cx = r.left + r.width / 2 - gr.left, cy = r.top + r.height / 2 - gr.top;
		at.box = { x: (cx - w / 2) / gr.width, y: (cy - h / 2) / gr.height, w: w / gr.width, h: h / gr.height };
	});
	return gr;
}
