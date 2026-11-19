import { sanitizeInline } from '#lib/model/sanitize.ts';

/**
 * Svelte action: a small rich-text field (bold / italic / underline / line breaks) for picture
 * titles and captions. Writes back sanitized html; never re-renders itself while focused.
 */
export function inlineEdit(node: HTMLElement, params: { value: string; onchange: (html: string) => void }) {
	let p = params;
	node.contentEditable = 'true';
	node.innerHTML = p.value || '';
	const onInput = () => p.onchange(sanitizeInline(node.innerHTML));
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
		if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
			e.preventDefault();
			document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]!);
			onInput();
		}
		e.stopPropagation(); // don't let page shortcuts (undo, arrows) act while typing here
	};
	const onPaste = (e: ClipboardEvent) => {
		e.preventDefault();
		document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
	};
	const stop = (e: Event) => e.stopPropagation(); // clicking in the text must not start a drag
	node.addEventListener('input', onInput);
	node.addEventListener('keydown', onKey);
	node.addEventListener('paste', onPaste);
	node.addEventListener('pointerdown', stop);
	return {
		update(next: typeof params) {
			p = next;
			if (document.activeElement !== node && node.innerHTML !== (p.value || '')) node.innerHTML = p.value || '';
		},
		destroy() {
			node.removeEventListener('input', onInput);
			node.removeEventListener('keydown', onKey);
			node.removeEventListener('paste', onPaste);
			node.removeEventListener('pointerdown', stop);
		}
	};
}
