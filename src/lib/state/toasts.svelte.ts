/* Small notifications at the bottom of the screen. */
export interface Toast { id: number; text: string }

let next = 1;
export const toasts = $state<Toast[]>([]);

/** Show a message. ms = 0 keeps it until `.close()` is called; `.set()` changes the text. */
export function toast(text: string, ms = 3200) {
	const t = { id: next++, text };
	toasts.push(t);
	const close = () => {
		const i = toasts.findIndex((x) => x.id === t.id);
		if (i >= 0) toasts.splice(i, 1);
	};
	if (ms) setTimeout(close, ms);
	return {
		close,
		set(text: string) {
			const x = toasts.find((x) => x.id === t.id);
			if (x) x.text = text;
		}
	};
}
