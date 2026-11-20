/* Screen-only state: zoom, ribbon tab, open dialog. */
export type Tab = 'home' | 'insert' | 'layout' | 'picture' | 'table' | 'template';
export type DialogKind = 'new' | 'template' | 'photos' | 'special' | 'word' | 'table' | 'confirm' | 'export' | 'docxChoice' | 'link';

export const ui = $state<{
	zoom: 'fit' | number;
	scale: number;
	tab: Tab;
	dialog: { kind: DialogKind; data?: any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
	busy: string;
}>({ zoom: 'fit', scale: 0.6, tab: 'home', dialog: null, busy: '' });

export function openDialog(kind: DialogKind, data?: unknown) {
	ui.dialog = { kind, data };
}
export function closeDialog() {
	ui.dialog = null;
}

/** Ask a yes/no question in a dialog. */
export function confirmAsk(message: string, okLabel = 'OK'): Promise<boolean> {
	return new Promise((resolve) => openDialog('confirm', { message, okLabel, resolve }));
}
