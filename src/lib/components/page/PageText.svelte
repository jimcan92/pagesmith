<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { Editor } from '@tiptap/core';
	import type { ContentPage } from '#lib/model/types.ts';
	import { hasText, sanitize } from '#lib/model/sanitize.ts';
	import { contentWidthPx } from '#lib/model/layout.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { createEditor, releaseEditor } from '#lib/state/editor.svelte.ts';

	let { page, thumb = false }: { page: ContentPage; thumb?: boolean } = $props();

	const editing = $derived(!thumb && doc.editingId === page.id);
	let host = $state<HTMLDivElement>();
	let editor: Editor | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const style = $derived(
		(page.textAlign === 'center' ? 'text-align:center;' : '') + (page.textV === 'bottom' && page.attachments.length ? 'order:2;' : '')
	);

	function save(html: string) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			const clean = sanitize(html, contentWidthPx(doc.project, page));
			if (clean !== page.html) { page.html = clean; doc.touch(); }
		}, 150);
	}

	$effect(() => {
		if (editing && host && !editor) {
			editor = createEditor(host, page.html, page.id, save);
			tick().then(() => editor?.commands.focus('end'));
		} else if (!editing && editor) {
			stop();
		}
	});

	function stop() {
		if (!editor) return;
		if (timer) { clearTimeout(timer); timer = null; }
		const clean = sanitize(editor.getHTML(), contentWidthPx(doc.project, page));
		const html = hasText(clean) ? clean : '';
		if (html !== page.html) { page.html = html; doc.touch(); }
		releaseEditor(editor);
		editor = null;
	}
	onDestroy(stop);

	function startEditing(e: MouseEvent) {
		if (thumb) return;
		e.stopPropagation();
		doc.select(page.id);
		doc.selectedAtt = null;
		doc.editingId = page.id;
	}
</script>

{#if editing}
	<div class="editor-host" bind:this={host} {style}></div>
{:else if hasText(page.html)}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="rt" class:editable={!thumb} {style} onclick={startEditing}>{@html page.html}</div>
{:else if !thumb}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="add-text no-print" onclick={startEditing}>Click to type…</div>
{/if}

<style>
	.editor-host { flex: none; }
	.editor-host :global(.rt) { min-height: 1.4em; }
	.rt.editable { cursor: text; }
	.rt.editable:hover { outline: 1px dashed rgba(47, 125, 225, 0.5); outline-offset: 2px; }
	.add-text {
		flex: none;
		font: italic 11pt Arial, sans-serif;
		color: #9a9a9a;
		cursor: text;
		padding: 2px 0;
	}
	.add-text:hover { color: #2f7de1; }
</style>
