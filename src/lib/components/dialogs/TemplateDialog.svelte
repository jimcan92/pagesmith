<script lang="ts">
	import { uid } from '#lib/model/defaults.ts';
	import type { Template } from '#lib/model/types.ts';
	import { importImageFile } from '#lib/io/images.ts';
	import { imageUrl } from '#lib/state/storage.ts';
	import { doc } from '#lib/state/doc.svelte.ts';
	import { closeDialog } from '#lib/state/ui.svelte.ts';
	import { exportTemplate, importTemplateFile, pickFiles } from '#lib/state/files.ts';
	import { toast } from '#lib/state/toasts.svelte.ts';
	import Modal from './Modal.svelte';

	// edit a copy; Apply puts it on the document
	let T = $state<Template>(structuredClone($state.snapshot(doc.project.template)));

	async function pickImage(): Promise<string | null> {
		const [f] = await pickFiles('image/*');
		if (!f) return null;
		return (await importImageFile(f, 3000)).id;
	}
	async function importFile() {
		const t = await importTemplateFile();
		if (t) { T = t; toast('Template loaded — click Apply'); }
	}
	function apply() {
		const ids = new Set(T.backgrounds.map((b) => b.id));
		doc.project.pages.forEach((p) => { if (p.type === 'content' && p.bg !== 'default' && p.bg !== 'none' && !ids.has(p.bg)) p.bg = 'default'; });
		doc.project.template = T;
		if (T.cover && !doc.hasCover) doc.addCover();
		doc.touch();
		closeDialog();
	}
</script>

<Modal title="Template" wide>
	<label class="flex items-center gap-2 mb-3">
		<span class="text-sm opacity-70 w-32">Template name</span>
		<input class="input input-sm flex-1" bind:value={T.name} />
	</label>

	<h4 class="text-xs font-bold uppercase tracking-wide opacity-60 mt-4 mb-2">Cover (one per document)</h4>
	<div class="flex gap-4 items-start">
		<div class="thumb p" style="background-image:url('{imageUrl(T.cover)}')">{T.cover ? '' : 'No cover'}</div>
		<div class="flex gap-2">
			<button class="btn btn-sm" onclick={async () => { const id = await pickImage(); if (id) T.cover = id; }}>{T.cover ? 'Change cover…' : 'Add cover…'}</button>
			{#if T.cover}<button class="btn btn-sm btn-ghost" onclick={() => (T.cover = '')}>Remove</button>{/if}
		</div>
	</div>

	<h4 class="text-xs font-bold uppercase tracking-wide opacity-60 mt-5 mb-1">Backgrounds</h4>
	<p class="text-xs opacity-70 mb-2">The margins are the <b>safe area</b> (inches from the edge): text and pictures stay inside, so they never cover the banner or the logos.</p>
	{#each T.backgrounds as b, i (b.id)}
		{@const fixed = b.id === 'portrait' || b.id === 'landscape'}
		<div class="flex gap-4 items-start py-3 border-b border-base-200">
			<div class="thumb {b.orientation === 'landscape' ? 'l' : 'p'}" style="background-image:url('{imageUrl(b.src)}')">{b.src ? '' : 'No image'}</div>
			<div class="flex-1 min-w-0 flex flex-col gap-2">
				<div class="flex items-center gap-2 flex-wrap">
					{#if fixed}
						<b>{b.name}</b><span class="text-xs opacity-60">(default for {b.orientation} pages)</span>
					{:else}
						<input class="input input-sm flex-1" bind:value={b.name} placeholder="e.g. Section divider" />
						<select class="select select-sm w-32" bind:value={b.orientation}>
							<option value="portrait">Portrait</option><option value="landscape">Landscape</option>
						</select>
					{/if}
				</div>
				<div class="flex gap-2 flex-wrap">
					<button class="btn btn-xs" onclick={async () => { const id = await pickImage(); if (id) b.src = id; }}>{b.src ? 'Change image…' : 'Add image…'}</button>
					{#if b.src}<button class="btn btn-xs btn-ghost" onclick={() => (b.src = '')}>Remove image</button>{/if}
					{#if !fixed}<button class="btn btn-xs btn-ghost text-error" onclick={() => T.backgrounds.splice(i, 1)}>Delete</button>{/if}
				</div>
				<div class="grid grid-cols-4 gap-2 text-xs">
					{#each ['top', 'bottom', 'left', 'right'] as const as s (s)}
						<label class="flex flex-col gap-0.5">{s[0].toUpperCase() + s.slice(1)}
							<input type="number" step="0.05" min="0" max="5" class="input input-xs" bind:value={b.margins[s]} />
						</label>
					{/each}
				</div>
			</div>
		</div>
	{/each}
	<button class="btn btn-sm mt-3"
		onclick={() => T.backgrounds.push({ id: uid('bg'), name: 'Special ' + (T.backgrounds.length - 1), orientation: 'portrait', src: '', margins: { ...T.backgrounds[0].margins } })}>
		+ Add special background
	</button>
	<p class="text-xs opacity-70 mt-1">Special backgrounds are extra page designs (divider, certificate frame, another header…). Choose them per page in Layout.</p>

	{#snippet actions()}
		<button class="btn btn-sm btn-ghost mr-auto" onclick={importFile}>Import…</button>
		<button class="btn btn-sm btn-ghost" onclick={() => exportTemplate($state.snapshot(T))}>Export…</button>
		<button class="btn btn-sm" onclick={closeDialog}>Cancel</button>
		<button class="btn btn-sm btn-primary" onclick={apply}>Apply</button>
	{/snippet}
</Modal>

<style>
	.thumb {
		flex: none; width: 96px; border: 1px solid var(--color-base-300); border-radius: 4px;
		background: #f4f2ee center/contain no-repeat; display: grid; place-items: center; font-size: 11px; color: #999;
	}
	.thumb.p { aspect-ratio: 8.5 / 13; }
	.thumb.l { aspect-ratio: 13 / 8.5; width: 140px; }
</style>
