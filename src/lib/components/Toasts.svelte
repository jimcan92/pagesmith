<script lang="ts">
	import { toasts } from '#lib/state/toasts.svelte.ts';
</script>

<div class="toast toast-center toast-bottom z-[60] no-print mb-8">
	{#each toasts as t (t.id)}
		<div class="alert bg-neutral text-neutral-content py-2 px-4 text-sm shadow-lg">{t.text}</div>
	{/each}
</div>
