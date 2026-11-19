<script lang="ts">
	import { live, cmd } from '#lib/state/editor.svelte.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import Group from './Group.svelte';

	// re-read the editor state whenever it changes (live.v ticks on every transaction)
	const st = $derived.by(() => {
		void live.v;
		const e = live.editor;
		if (!e) return null;
		const ts = e.getAttributes('textStyle');
		return {
			block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
			size: (ts.fontSize as string) || '',
			color: toHex(ts.color as string),
			bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
			align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) || 'left',
			ul: e.isActive('bulletList'), ol: e.isActive('orderedList')
		};
	});
	const off = $derived(!st);
	/** The color input needs #rrggbb; colors read back from saved text can be rgb(...). */
	function toHex(c?: string) {
		if (!c) return '#000000';
		if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
		if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((h) => h + h).join('').toLowerCase();
		const m = c.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
		return m ? '#' + m.slice(1, 4).map((n) => (+n).toString(16).padStart(2, '0')).join('') : '#000000';
	}
	const SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt', '48pt'];
	const keep = (e: MouseEvent) => e.preventDefault(); // don't take the focus away from the text

	function setBlock(v: string) {
		if (v === 'p') cmd((c) => c.setParagraph());
		else cmd((c) => c.toggleHeading({ level: +v[1] as 1 | 2 | 3 }));
	}
	function startEditing() {
		const pg = doc.currentContent;
		if (pg) doc.editingId = pg.id;
	}
</script>

<Group label="Font">
	<select class="rs" disabled={off} value={st?.block ?? 'p'} onchange={(e) => setBlock(e.currentTarget.value)} title="Paragraph style">
		<option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
	</select>
	<select class="rs" disabled={off} value={st?.size ?? ''} title="Font size"
		onchange={(e) => { const v = e.currentTarget.value; cmd((c) => (v ? c.setFontSize(v) : c.unsetFontSize())); }}>
		<option value="">Size</option>
		{#each SIZES as s (s)}<option value={s}>{s.replace('pt', '')}</option>{/each}
	</select>
	<br />
	<button class="rb" class:on={st?.bold} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleBold())} title="Bold (Ctrl+B)"><b>B</b></button>
	<button class="rb" class:on={st?.italic} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleItalic())} title="Italic (Ctrl+I)"><i>I</i></button>
	<button class="rb" class:on={st?.underline} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleUnderline())} title="Underline (Ctrl+U)"><u>U</u></button>
	<button class="rb" class:on={st?.strike} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleStrike())} title="Strikethrough"><s>S</s></button>
	<input type="color" disabled={off} value={st?.color ?? '#000000'} title="Text color"
		oninput={(e) => { const v = e.currentTarget.value; cmd((c) => c.setColor(v)); }} />
	<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.unsetAllMarks().clearNodes())} title="Clear formatting">⌫</button>
</Group>

<Group label="Paragraph">
	{#each [['left', '⯇', 'Align left'], ['center', '≡', 'Center'], ['right', '⯈', 'Align right'], ['justify', '☰', 'Justify']] as [a, ico, t] (a)}
		<button class="rb" class:on={st?.align === a} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.setTextAlign(a))} title={t}>{ico}</button>
	{/each}
	<br />
	<button class="rb" class:on={st?.ul} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleBulletList())} title="Bullets">• List</button>
	<button class="rb" class:on={st?.ol} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleOrderedList())} title="Numbering">1. List</button>
	<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.liftListItem('listItem'))} title="Decrease indent">⇤</button>
	<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.sinkListItem('listItem'))} title="Increase indent">⇥</button>
</Group>

<Group label="Clipboard">
	<div class="text-xs opacity-70 max-w-40 leading-snug">Paste from Word keeps formatting and tables. Paste a screenshot onto a page to add it as a picture.</div>
</Group>

{#if off}
	<div class="hint">
		Click the text of a page to format it.
		{#if doc.currentContent}<button class="btn btn-xs btn-primary ml-2" onclick={startEditing}>Edit text on page {doc.pageIndex(doc.currentId) + 1}</button>{/if}
	</div>
{/if}

<style>
	/* only uses the space left after the groups, so they don't move when it appears */
	.hint { flex: 1 1 0; min-width: 0; overflow: hidden; align-self: center; font-size: 12.5px; color: #6b625b; padding: 0 12px; max-width: 240px; line-height: 1.4; }
</style>
