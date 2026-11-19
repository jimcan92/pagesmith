/* The open document, the selection, undo/redo and autosave. */
import { flushSync } from 'svelte';
import { blankTemplate, makeContentPage, makeCoverPage, newProject, uid } from '#lib/model/defaults.ts';
import { cleanProject, cleanTemplate } from '#lib/io/legacy.ts';
import type { Attachment, ContentPage, Orientation, Page, Project, Template } from '#lib/model/types.ts';
import { cleanupImages, kvGet, kvSet, loadAllImages, openDb, storageReady } from './storage';
import { toast } from './toasts.svelte';

const HISTORY_MAX = 150;

class DocState {
	project = $state<Project>(newProject());
	currentId = $state('');
	/** The page whose text is being edited (the one with a live editor). */
	editingId = $state<string | null>(null);
	/** The picture last clicked: page id + index. */
	selectedAtt = $state<{ pageId: string; i: number } | null>(null);
	saveStatus = $state('—');
	ready = $state(false);
	/** Pages that are too full: page id → message. */
	warnings = $state<Record<string, string>>({});
	defaultTemplate = $state<Template>(blankTemplate());

	#undo: string[] = [];
	#redo: string[] = [];
	#historyTimer: ReturnType<typeof setTimeout> | null = null;
	#saveTimer: ReturnType<typeof setTimeout> | null = null;
	#restoring = false;
	canUndo = $state(false);
	canRedo = $state(false);

	get current(): Page | undefined {
		return this.project.pages.find((p) => p.id === this.currentId);
	}
	get currentContent(): ContentPage | undefined {
		const p = this.current;
		return p?.type === 'content' ? p : undefined;
	}
	pageById = (id: string) => this.project.pages.find((p) => p.id === id);
	pageIndex = (id: string) => this.project.pages.findIndex((p) => p.id === id);
	get hasCover() {
		return this.project.pages.some((p) => p.type === 'cover');
	}

	/* ---------------- lifecycle ---------------- */
	async boot() {
		const ok = await openDb();
		if (!ok) toast('Browser storage is blocked — use Save to keep your work.', 6000);
		try {
			await loadAllImages();
			const dt = await kvGet('defaultTemplate');
			if (dt) this.defaultTemplate = cleanTemplate(dt);
			const saved = await kvGet('project');
			if (saved) {
				this.project = cleanProject(saved);
				const cid = await kvGet<string>('currentId');
				this.currentId = cid && this.pageById(cid) ? cid : this.project.pages[0].id;
			}
		} catch (e) {
			console.error(e);
		}
		if (!this.currentId) this.currentId = this.project.pages[0].id;
		this.saveStatus = storageReady() ? 'All changes saved' : 'Not saved (storage blocked)';
		this.resetHistory();
		this.ready = true;
		this.cleanup();
	}

	/** Replace the whole document (New / Open / import). Undoable. */
	replace(p: Project, opts: { history?: 'keep' | 'reset' } = {}) {
		this.commitHistory();
		this.project = p;
		this.currentId = p.pages[0]?.id ?? '';
		this.editingId = null;
		this.selectedAtt = null;
		this.warnings = {};
		if (opts.history === 'reset') this.resetHistory();
		this.touch();
	}

	newDocument(name: string, template: Template) {
		this.replace(newProject(name, template));
		this.cleanup();
	}

	/* ---------------- autosave + history ---------------- */
	touch() {
		this.saveStatus = 'Saving…';
		if (!this.#restoring) {
			if (this.#historyTimer) clearTimeout(this.#historyTimer);
			this.#historyTimer = setTimeout(() => this.commitHistory(), 400);
			this.canUndo = true;
		}
		if (this.#saveTimer) clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(async () => {
			try {
				await kvSet('project', $state.snapshot(this.project));
				await kvSet('currentId', this.currentId);
				this.saveStatus = storageReady() ? 'All changes saved' : 'Not saved (storage blocked)';
			} catch (e) {
				console.error(e);
				this.saveStatus = 'Save failed — use Save';
			}
		}, 500);
	}

	#snapshot = () => JSON.stringify($state.snapshot(this.project));

	resetHistory() {
		if (this.#historyTimer) clearTimeout(this.#historyTimer);
		this.#historyTimer = null;
		this.#undo = [this.#snapshot()];
		this.#redo = [];
		this.#updateFlags();
	}

	commitHistory() {
		if (this.#historyTimer) clearTimeout(this.#historyTimer);
		this.#historyTimer = null;
		if (this.#restoring) return;
		const s = this.#snapshot();
		if (s === this.#undo[this.#undo.length - 1]) return this.#updateFlags();
		this.#undo.push(s);
		if (this.#undo.length > HISTORY_MAX) this.#undo.shift();
		this.#redo = [];
		this.#updateFlags();
	}

	#restore(s: string) {
		this.#restoring = true;
		try {
			this.project = JSON.parse(s);
			if (!this.pageById(this.currentId)) this.currentId = this.project.pages[0]?.id ?? '';
			this.editingId = null;
			this.selectedAtt = null;
			this.touch();
		} finally {
			this.#restoring = false;
		}
		this.#updateFlags();
	}

	/** Close the text editor now, so its text is saved (and becomes a history step) before an
	 *  undo/redo replaces the document; otherwise it would write its old text back on top. */
	#endEditing() {
		if (!this.editingId) return;
		this.editingId = null;
		flushSync();
	}

	undo() {
		this.#endEditing();
		this.commitHistory();
		if (this.#undo.length < 2) return toast('Nothing to undo');
		this.#redo.push(this.#undo.pop()!);
		this.#restore(this.#undo[this.#undo.length - 1]);
	}

	redo() {
		this.#endEditing();
		this.commitHistory();
		if (!this.#redo.length) return toast('Nothing to redo');
		const s = this.#redo.pop()!;
		this.#undo.push(s);
		this.#restore(s);
	}

	#updateFlags() {
		this.canUndo = this.#undo.length > 1 || !!this.#historyTimer;
		this.canRedo = this.#redo.length > 0;
	}

	/** Pictures still used by the document, the default template or the undo history. */
	usedImages() {
		const used = new Set<string>();
		const add = (s: string) => (s.match(/img_\w+/g) || []).forEach((m) => used.add(m));
		add(JSON.stringify($state.snapshot(this.project)));
		add(JSON.stringify($state.snapshot(this.defaultTemplate)));
		[...this.#undo, ...this.#redo].forEach(add);
		return used;
	}
	cleanup() {
		cleanupImages(this.usedImages()).catch(() => {});
	}

	/* ---------------- page operations ---------------- */
	select(id: string) {
		if (!this.pageById(id)) return;
		if (this.currentId !== id) {
			this.currentId = id;
			if (this.editingId && this.editingId !== id) this.editingId = null;
			if (this.selectedAtt && this.selectedAtt.pageId !== id) this.selectedAtt = null;
		}
	}

	/** Keep the (single) cover first. */
	#coverFirst() {
		const i = this.project.pages.findIndex((p) => p.type === 'cover');
		if (i > 0) this.project.pages.unshift(this.project.pages.splice(i, 1)[0]);
	}

	insertPages(pages: Page[], afterId: string = this.currentId) {
		const i = this.pageIndex(afterId);
		this.project.pages.splice(i < 0 ? this.project.pages.length : i + 1, 0, ...pages);
		this.#coverFirst();
		this.currentId = pages[pages.length - 1].id;
		this.touch();
		return pages;
	}

	addPage(orientation: Orientation, bg = 'default') {
		return this.insertPages([makeContentPage(orientation, bg)])[0];
	}

	addCover() {
		const c = this.project.pages.find((p) => p.type === 'cover');
		if (c) {
			this.select(c.id);
			toast('This document already has its cover (page 1).');
			return c;
		}
		const pg = makeCoverPage();
		this.project.pages.unshift(pg);
		this.currentId = pg.id;
		this.touch();
		if (!this.project.template.cover) toast('Now add the cover image (Template → Cover).');
		return pg;
	}

	movePage(id: string, toIndex: number) {
		const i = this.pageIndex(id);
		if (i < 0) return;
		const [pg] = this.project.pages.splice(i, 1);
		this.project.pages.splice(Math.max(0, Math.min(toIndex, this.project.pages.length)), 0, pg);
		this.#coverFirst();
		this.touch();
	}

	deletePage(id: string) {
		if (this.project.pages.length === 1) return toast('A document needs at least one page.');
		const i = this.pageIndex(id);
		if (i < 0) return;
		this.project.pages.splice(i, 1);
		if (this.currentId === id) this.currentId = this.project.pages[Math.min(i, this.project.pages.length - 1)].id;
		if (this.editingId === id) this.editingId = null;
		this.touch();
	}

	duplicatePage(id: string) {
		const src = this.pageById(id);
		if (!src || src.type === 'cover') return;
		const copy = structuredClone($state.snapshot(src)) as ContentPage;
		copy.id = uid('pg');
		copy.attachments.forEach((a) => (a.id = uid('att')));
		this.insertPages([copy], id);
	}

	/** Move picture `i` of page `fromId` to page `toId` (at index `at`, default: the end). */
	moveAttachment(fromId: string, i: number, toId: string, at: number | null = null, place?: (to: ContentPage, a: Attachment) => void) {
		const from = this.pageById(fromId), to = this.pageById(toId);
		if (!from || from.type !== 'content') return false;
		if (!to || to.type !== 'content') { toast('Pictures can only go on content pages, not the cover.'); return false; }
		const [a] = from.attachments.splice(i, 1);
		if (!a) return false;
		delete a.box;
		if (to.layout === 'free') place?.(to, a);
		if (at == null || at > to.attachments.length) to.attachments.push(a);
		else to.attachments.splice(at, 0, a);
		this.selectedAtt = { pageId: to.id, i: at ?? to.attachments.length - 1 };
		this.touch();
		return true;
	}
}

export const doc = new DocState();
