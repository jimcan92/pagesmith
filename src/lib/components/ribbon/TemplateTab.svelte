<script lang="ts">
	import { doc } from '#lib/state/doc.svelte.ts';
	import { openDialog } from '#lib/state/ui.svelte.ts';
	import { exportTemplate, importTemplateFile } from '#lib/state/files.ts';
	import { toast } from '#lib/state/toasts.svelte.ts';
	import { kvSet } from '#lib/state/storage.ts';
	import Group from './Group.svelte';

	async function importTpl() {
		const t = await importTemplateFile();
		if (!t) return;
		doc.project.template = t;
		doc.project.pages.forEach((p) => { if (p.type === 'content' && p.bg !== 'default' && p.bg !== 'none' && !t.backgrounds.some((b) => b.id === p.bg)) p.bg = 'default'; });
		if (t.cover && !doc.hasCover) doc.addCover();
		doc.touch();
		toast(`Template “${t.name}” applied`);
	}
	async function asDefault() {
		doc.defaultTemplate = structuredClone($state.snapshot(doc.project.template));
		await kvSet('defaultTemplate', $state.snapshot(doc.defaultTemplate));
		toast('New documents on this computer will use this template');
	}
</script>

<Group label="Template">
	<button class="rb big" onclick={() => openDialog('template')} title="Cover, backgrounds, special backgrounds and margins"><span class="ico">✎</span>Edit template</button>
	<button class="rb big" onclick={importTpl} title="Load a .template.json file"><span class="ico">⤓</span>Import</button>
	<button class="rb big" onclick={() => exportTemplate($state.snapshot(doc.project.template))} title="Save the template as a file to share"><span class="ico">⤒</span>Export</button>
	<button class="rb big" onclick={asDefault} title="Use this template for new documents on this computer"><span class="ico">☆</span>Set default</button>
</Group>
<div class="self-center text-xs opacity-70 px-3 max-w-72 leading-snug">
	Current template: <b>{doc.project.template.name}</b>. Share it with “Export” so every team uses the same look.
</div>
