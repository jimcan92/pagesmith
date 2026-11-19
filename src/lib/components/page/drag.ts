/* Shared helpers for dragging pictures across pages (canvas pages and thumbnails). */

/** The page (canvas slot or thumbnail) under the pointer: its id, or null. */
export function pageAt(x: number, y: number): { id: string; el: HTMLElement } | null {
	const el = document.elementFromPoint(x, y)?.closest('[data-page-id]') as HTMLElement | null;
	return el ? { id: el.dataset.pageId!, el } : null;
}

let target: HTMLElement | null = null;
/** Highlight the page a picture would be dropped on (not the page it comes from). */
export function markDropTarget(el: HTMLElement | null, fromId?: string) {
	const t = el && el.dataset.pageId !== fromId ? el : null;
	if (t === target) return;
	target?.classList.remove('drop-target');
	target = t;
	target?.classList.add('drop-target');
}

/** Scroll the canvas while dragging near its top or bottom edge. */
export function autoScroll(state: { active: boolean; y: number }) {
	const box = document.querySelector('.canvas-scroll') as HTMLElement | null;
	if (!box) return;
	const tick = () => {
		if (!state.active) return;
		const r = box.getBoundingClientRect(), edge = 60;
		if (state.y < r.top + edge) box.scrollTop -= Math.ceil((r.top + edge - state.y) / 4);
		else if (state.y > r.bottom - edge) box.scrollTop += Math.ceil((state.y - (r.bottom - edge)) / 4);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** The click that ends a drag should not also do something else. */
export function suppressClick() {
	const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
	document.addEventListener('click', stop, { capture: true, once: true });
	setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 300);
}
