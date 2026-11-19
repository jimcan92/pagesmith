/* The live text editor (TipTap) of the page being edited, shared with the ribbon. */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

/** Table cells keep a background color (from Word shading or the ribbon). */
const bgAttr = {
	backgroundColor: {
		default: null,
		parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
		renderHTML: (a: { backgroundColor?: string | null }) => (a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {})
	}
};
const Cell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });
const Header = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });

export const extensions = [
	StarterKit.configure({ code: false, codeBlock: false, link: false, heading: { levels: [1, 2, 3] } }),
	TextAlign.configure({ types: ['heading', 'paragraph'] }),
	TextStyleKit,
	Table.configure({ resizable: true, cellMinWidth: 24, lastColumnResizable: false }),
	TableRow,
	Header,
	Cell
];

/** The active editor and a counter that changes on every edit/selection (for toolbar state). */
export const live = $state<{ editor: Editor | null; pageId: string | null; v: number }>({ editor: null, pageId: null, v: 0 });

export function createEditor(el: HTMLElement, html: string, pageId: string, onChange: (html: string) => void) {
	const editor = new Editor({
		element: el,
		extensions,
		content: html || '<p></p>',
		editorProps: { attributes: { class: 'rt', spellcheck: 'true' } },
		onUpdate: ({ editor }) => onChange(editor.getHTML()),
		onTransaction: () => { live.v++; },
		onFocus: () => { live.editor = editor; live.pageId = pageId; live.v++; }
	});
	live.editor = editor;
	live.pageId = pageId;
	return editor;
}

export function releaseEditor(editor: Editor) {
	if (live.editor === editor) { live.editor = null; live.pageId = null; }
	editor.destroy();
}

/** Make every column of the table at the cursor the same width (filling `widthPx`). */
export function equalizeColumns(widthPx: number) {
	const e = live.editor;
	if (!e) return;
	const { state } = e;
	const at = state.selection.$from; // resolved position of the cursor
	for (let d = at.depth; d > 0; d--) {
		const node = at.node(d);
		if (node.type.name !== 'table') continue;
		const tablePos = at.before(d);
		const cols = Math.max(...Array.from({ length: node.childCount }, (_, r) => {
			let n = 0;
			node.child(r).forEach((c) => (n += c.attrs.colspan || 1));
			return n;
		}));
		const w = Math.floor(widthPx / cols);
		const tr = state.tr;
		node.descendants((cell, pos) => {
			if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return true;
			tr.setNodeMarkup(tablePos + 1 + pos, undefined, { ...cell.attrs, colwidth: Array(cell.attrs.colspan || 1).fill(w) });
			return false;
		});
		e.view.dispatch(tr);
		e.commands.focus();
		return;
	}
}

/** Run a command on the active editor (keeps its selection). */
export function cmd(fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) {
	const e = live.editor;
	if (!e) return false;
	return fn(e.chain().focus()).run();
}
