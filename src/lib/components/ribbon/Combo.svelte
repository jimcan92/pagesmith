<script lang="ts">
	/**
	 * A Word-style combo box: type a value (or part of one to search) and press Enter,
	 * or pick from the list. The editor keeps its selection, so the value applies to the selected text.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let {
		value,
		options,
		onpick,
		disabled = false,
		width = 60,
		title = '',
		filter = true,
		fontPreview = false,
		listWidth
	}: {
		value: string;
		options: string[];
		onpick: (v: string) => boolean | void; // return false to reject (the box goes back to the old value)
		disabled?: boolean;
		width?: number;
		title?: string;
		filter?: boolean; // narrow the list to what's typed (fonts) or just jump to it (sizes)
		fontPreview?: boolean;
		listWidth?: number;
	} = $props();

	const listId = $props.id();
	let text = $state('');
	let open = $state(false);
	let typed = $state(false); // the user changed the text since opening
	let hi = $state(-1);
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLDivElement>();

	$effect(() => { if (document.activeElement !== input) text = value; });

	const shown = $derived.by(() => {
		const q = text.trim().toLowerCase();
		if (!filter || !typed || !q) return options;
		const starts = options.filter((o) => o.toLowerCase().startsWith(q));
		const has = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
		return [...starts, ...has];
	});

	let box = $state<HTMLDivElement>();
	let pos = $state({ l: 0, t: 0, w: 0 });
	function show() {
		if (disabled) return;
		// the ribbon panel scrolls sideways (and so clips), so the list is placed on the screen instead
		const r = box?.getBoundingClientRect();
		if (r) pos = { l: r.left, t: r.bottom + 2, w: r.width };
		open = true;
		hi = shown.findIndex((o) => o.toLowerCase() === text.trim().toLowerCase());
		queueMicrotask(() => list?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }));
	}
	function close() {
		open = false;
		typed = false;
		hi = -1;
	}
	function pick(v: string) {
		close();
		const ok = onpick(v.trim());
		text = ok === false ? value : v.trim();
		input?.blur();
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) return show();
			const n = shown.length;
			if (!n) return;
			hi = e.key === 'ArrowDown' ? (hi + 1) % n : (hi - 1 + n) % n;
			queueMicrotask(() => list?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			// a highlighted list item wins; else a search with a match picks the best match; else the typed text
			const q = text.trim();
			if (open && hi >= 0 && shown[hi]) pick(shown[hi]);
			else if (filter && typed && q && shown.length && !shown.some((o) => o.toLowerCase() === q.toLowerCase())) pick(shown[0]);
			else if (q) pick(q);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
			text = value;
			input?.blur();
		} else if (e.key === 'Tab') {
			close();
		}
	}
</script>

<div class="combo" class:disabled style="width:{width}px" {title} bind:this={box}>
	<input
		bind:this={input}
		bind:value={text}
		{disabled}
		spellcheck="false"
		autocomplete="off"
		aria-label={title}
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		onfocus={(e) => { e.currentTarget.select(); show(); }}
		oninput={() => { typed = true; open = true; hi = filter ? (shown.length ? 0 : -1) : options.findIndex((o) => o.startsWith(text.trim())); }}
		onblur={() => { close(); text = value; }}
		onkeydown={key}
		style={fontPreview && text ? `font-family:'${text.replace(/'/g, '')}', Arial, sans-serif` : ''}
	/>
	<button class="dd" tabindex="-1" {disabled} aria-label="Show list" onmousedown={(e) => { e.preventDefault(); if (open) close(); else input?.focus(); }}><ChevronDown /></button>
	{#if open && shown.length}
		<div class="list" role="listbox" id={listId} bind:this={list} style="left:{pos.l}px;top:{pos.t}px;min-width:{pos.w}px;{listWidth ? `width:${listWidth}px` : ''}">
			{#each shown as o, i (o)}
				<button
					role="option"
					aria-selected={o === value}
					class:hi={i === hi}
					class:cur={o === value}
					tabindex="-1"
					onmousedown={(e) => { e.preventDefault(); pick(o); }}
					style={fontPreview ? `font-family:'${o}', Arial, sans-serif` : ''}
				>{o}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.combo { position: relative; display: inline-flex; height: 28px; border: 1px solid #d6cdc2; border-radius: 4px; background: #fff; }
	.combo:hover:not(.disabled) { border-color: #b9aea1; }
	.combo:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
	.combo.disabled { opacity: 0.45; }
	input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 12.5px; padding: 0 2px 0 6px; color: #3b3530; }
	.dd { width: 18px; flex: none; display: grid; place-items: center; border: none; background: transparent; cursor: pointer; color: #6f6760; border-radius: 0 3px 3px 0; }
	.dd:hover:not(:disabled) { background: #f0ebe4; }
	.dd :global(svg) { width: 13px; height: 13px; }
	.list {
		position: fixed; z-index: 70; max-height: min(320px, 60vh); overflow-y: auto;
		background: #fff; border: 1px solid #d6cdc2; border-radius: 6px; box-shadow: 0 8px 22px rgba(40, 25, 15, 0.16); padding: 3px;
	}
	.list button { display: block; width: 100%; text-align: left; padding: 4px 8px; font-size: 13px; border: none; background: transparent; border-radius: 4px; cursor: pointer; white-space: nowrap; color: #2b2622; }
	.list button.cur { font-weight: 600; }
	.list button.hi, .list button:hover { background: #f3eadb; }
</style>
