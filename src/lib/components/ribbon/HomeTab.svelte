<script lang="ts">
	import { live, cmd } from '#lib/state/editor.svelte.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import Group from './Group.svelte';
	import Combo from './Combo.svelte';
	import { FONTS, FONT_SIZES, DEFAULT_FONT, parseFontSize, firstFamily } from '#lib/model/fonts.ts';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';
	import Underline from '@lucide/svelte/icons/underline';
	import Strikethrough from '@lucide/svelte/icons/strikethrough';
	import Baseline from '@lucide/svelte/icons/baseline';
	import RemoveFormatting from '@lucide/svelte/icons/remove-formatting';
	import AlignLeft from '@lucide/svelte/icons/text-align-start';
	import AlignCenter from '@lucide/svelte/icons/text-align-center';
	import AlignRight from '@lucide/svelte/icons/text-align-end';
	import AlignJustify from '@lucide/svelte/icons/text-align-justify';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import IndentDecrease from '@lucide/svelte/icons/list-indent-decrease';
	import IndentIncrease from '@lucide/svelte/icons/list-indent-increase';
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import TextCursorInput from '@lucide/svelte/icons/text-cursor-input';

	const ALIGN = [['left', AlignLeft, 'Align left'], ['center', AlignCenter, 'Center'], ['right', AlignRight, 'Align right'], ['justify', AlignJustify, 'Justify']] as const;

	// re-read the editor state whenever it changes (live.v ticks on every transaction)
	const st = $derived.by(() => {
		void live.v;
		const e = live.editor;
		if (!e) return null;
		const ts = e.getAttributes('textStyle');
		return {
			block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
			size: (ts.fontSize as string) || '',
			family: firstFamily(ts.fontFamily as string),
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
	/** The size Word would show: the set size, else the paragraph style's size. */
	function shownSize(s: { size: string; block: string }) {
		const set = s.size.match(/^([\d.]+)pt$/)?.[1];
		if (set) return set;
		if (s.size.endsWith('px')) return String(Math.round(parseFloat(s.size) * 0.75 * 2) / 2);
		return { h1: '16', h2: '13.5', h3: '12' }[s.block] ?? '11';
	}
	function setSize(v: string) {
		const n = parseFontSize(v);
		if (n == null) return false;
		cmd((c) => c.setFontSize(`${n}pt`));
	}
	function setFont(v: string) {
		const name = v.replace(/["';{}<>]/g, '').trim();
		if (!name) return false;
		const known = FONTS.find((f) => f.toLowerCase() === name.toLowerCase()) ?? name;
		cmd((c) => (known === DEFAULT_FONT ? c.unsetFontFamily() : c.setFontFamily(/\s/.test(known) ? `"${known}"` : known)));
	}
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

<Group label="Clipboard">
	<div class="rb big static" title="Paste with Ctrl+V. Pasting from Word keeps formatting and tables; pasting a screenshot onto a page adds it as a picture.">
		<ClipboardPaste />Paste<span class="kbd-hint">Ctrl V</span>
	</div>
</Group>

<Group label="Font">
	<div class="rows">
		<div class="row">
			<Combo width={138} listWidth={210} title="Font" disabled={off} options={FONTS} fontPreview
				value={st?.family || DEFAULT_FONT} onpick={setFont} />
			<Combo width={52} title="Font size" disabled={off} options={FONT_SIZES} filter={false}
				value={st ? shownSize(st) : ''} onpick={setSize} />
			<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.unsetAllMarks().clearNodes())} title="Clear formatting" aria-label="Clear formatting"><RemoveFormatting /></button>
		</div>
		<div class="row">
			<button class="rb" class:on={st?.bold} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleBold())} title="Bold (Ctrl+B)" aria-label="Bold"><Bold /></button>
			<button class="rb" class:on={st?.italic} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleItalic())} title="Italic (Ctrl+I)" aria-label="Italic"><Italic /></button>
			<button class="rb" class:on={st?.underline} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleUnderline())} title="Underline (Ctrl+U)" aria-label="Underline"><Underline /></button>
			<button class="rb" class:on={st?.strike} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleStrike())} title="Strikethrough" aria-label="Strikethrough"><Strikethrough /></button>
			<label class="rb color-btn" class:disabled={off} title="Text color">
				<span class="flex flex-col items-center"><Baseline /><span class="swatch" style="background:{st?.color ?? '#000000'}"></span></span>
				<input type="color" disabled={off} value={st?.color ?? '#000000'} oninput={(e) => { const v = e.currentTarget.value; cmd((c) => c.setColor(v)); }} />
			</label>
			<span class="sep"></span>
			<select class="rs w-24" disabled={off} value={st?.block ?? 'p'} onchange={(e) => setBlock(e.currentTarget.value)} title="Paragraph style">
				<option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
			</select>
		</div>
	</div>
</Group>

<Group label="Paragraph">
	<div class="rows">
		<div class="row">
			<button class="rb" class:on={st?.ul} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleBulletList())} title="Bullets" aria-label="Bullets"><List /></button>
			<button class="rb" class:on={st?.ol} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.toggleOrderedList())} title="Numbering" aria-label="Numbering"><ListOrdered /></button>
			<span class="sep"></span>
			<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.liftListItem('listItem'))} title="Decrease indent" aria-label="Decrease indent"><IndentDecrease /></button>
			<button class="rb" disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.sinkListItem('listItem'))} title="Increase indent" aria-label="Increase indent"><IndentIncrease /></button>
		</div>
		<div class="row">
			{#each ALIGN as [a, Ico, t] (a)}
				<button class="rb" class:on={st?.align === a} disabled={off} onmousedown={keep} onclick={() => cmd((c) => c.setTextAlign(a))} title={t} aria-label={t}><Ico /></button>
			{/each}
		</div>
	</div>
</Group>

{#if off}
	<div class="ribbon-tip">
		<div>
			Click the text of a page to format it.
			{#if doc.currentContent}<button class="btn btn-xs btn-primary mt-1 whitespace-nowrap" onclick={startEditing}><TextCursorInput size={14} />Edit text on page {doc.pageIndex(doc.currentId) + 1}</button>{/if}
		</div>
	</div>
{/if}

