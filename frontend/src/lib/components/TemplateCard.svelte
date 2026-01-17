<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Template } from '../types';

	export let template: Template;

	const dispatch = createEventDispatcher<{
		select: { prompt: string };
	}>();

	function handleClick() {
		dispatch('select', { prompt: template.prompt });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<button
	type="button"
	on:click={handleClick}
	on:keydown={handleKeydown}
	class="text-left w-full p-3 rounded border border-terminal-border bg-terminal-surface
           hover:border-terminal-accent hover:bg-terminal-surface/80
           transition-colors cursor-pointer group"
>
	<div class="flex items-start gap-3">
		<span class="text-terminal-accent text-lg font-mono">{template.icon}</span>
		<div class="flex-1 min-w-0">
			<h3 class="text-terminal-text font-medium text-sm group-hover:text-terminal-accent transition-colors">
				{template.name}
			</h3>
			<p class="text-terminal-dim text-xs mt-1 line-clamp-2">
				{template.description}
			</p>
		</div>
	</div>
</button>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
