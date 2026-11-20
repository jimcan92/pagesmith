/* Hyperlinks: on the selected text (in the page editor) or on the selected picture. */
import type { ContentPage } from '#lib/model/types.ts';
import { safeUrl } from '#lib/model/sanitize.ts';
import { doc } from './doc.svelte';
import { live } from './editor.svelte';
import { openDialog } from './ui.svelte';
import { toast } from './toasts.svelte';

export interface LinkTarget {
	pic?: { pageId: string; i: number };
	url: string;
	text: string; // the linked text (text links only)
	hasText: boolean; // text was selected (or the cursor was in a link)
}

/** Can a link be added right now (text being edited, or a picture selected)? */
export const canLink = () => !!doc.selectedAtt || !!live.editor;

/** Insert / edit a link (Ctrl+K): on the selected picture, else on the selected text. */
export function openLinkDialog() {
	const sel = doc.selectedAtt;
	if (sel) {
		const pg = doc.pageById(sel.pageId) as ContentPage | undefined;
		const a = pg?.attachments[sel.i];
		if (a) return openDialog('link', { pic: { ...sel }, url: a.link || '', text: '', hasText: false } satisfies LinkTarget);
	}
	const e = live.editor;
	if (!e) return toast('Click into the page text or select a picture first');
	// inside an existing link: take all of it
	if (e.isActive('link')) e.chain().extendMarkRange('link').run();
	const { from, to } = e.state.selection;
	const text = e.state.doc.textBetween(from, to, ' ');
	openDialog('link', { url: (e.getAttributes('link').href as string) || '', text, hasText: from !== to } satisfies LinkTarget);
}

/** Apply the dialog. Returns an error message, or '' when done. */
export function applyLink(t: LinkTarget, url: string, text: string): string {
	const href = safeUrl(url);
	if (!href) return 'Type a web address (https://…), an e-mail address or a phone link (tel:…).';
	if (t.pic) {
		const a = (doc.pageById(t.pic.pageId) as ContentPage | undefined)?.attachments[t.pic.i];
		if (!a) return '';
		a.link = href;
		doc.touch();
		return '';
	}
	const e = live.editor;
	if (!e) return 'The page text is no longer being edited.';
	const show = text.trim();
	const c = e.chain().focus();
	if (!t.hasText || (show && show !== t.text)) {
		// nothing selected, or new text typed: put in the text with the link on it
		c.insertContent({ type: 'text', text: show || href, marks: [{ type: 'link', attrs: { href } }] }).unsetMark('link').run();
	} else {
		c.extendMarkRange('link').setLink({ href }).run();
	}
	return '';
}

export function removeLink(t: LinkTarget) {
	if (t.pic) {
		const a = (doc.pageById(t.pic.pageId) as ContentPage | undefined)?.attachments[t.pic.i];
		if (a) { delete a.link; doc.touch(); }
		return;
	}
	live.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
}
