/* Small notifications at the bottom of the screen. */
export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; text: string; action?: ToastAction }

let next = 1;
export const toasts = $state<Toast[]>([]);

/** Show a message. ms = 0 keeps it until `.close()` is called; `.set()` changes the text.
 *  An action (e.g. Undo) shows as a button that also closes the message. */
export function toast(text: string, ms = 3200, action?: ToastAction) {
	const t: Toast = { id: next++, text, action };
	toasts.push(t);
	const close = () => {
		const i = toasts.findIndex((x) => x.id === t.id);
		if (i >= 0) toasts.splice(i, 1);
	};
	if (action) t.action = { label: action.label, run: () => { close(); action.run(); } };
	if (ms) setTimeout(close, ms);
	return {
		close,
		set(text: string) {
			const x = toasts.find((x) => x.id === t.id);
			if (x) x.text = text;
		}
	};
}
