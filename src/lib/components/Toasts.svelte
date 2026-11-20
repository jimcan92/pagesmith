<script lang="ts">
	import { toasts } from '#lib/state/toasts.svelte.ts';
</script>

<div class="toast toast-center toast-bottom z-[60] no-print mb-8">
	{#each toasts as t (t.id)}
		<div class="alert bg-neutral text-neutral-content py-2 px-4 text-sm shadow-lg flex items-center gap-3">
			<span>{t.text}</span>
			{#if t.action}<button class="btn btn-xs btn-secondary" onclick={t.action.run}>{t.action.label}</button>{/if}
		</div>
	{/each}
</div>
