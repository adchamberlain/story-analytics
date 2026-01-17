<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let placeholder = 'Type a message...';
	export let disabled = false;

	const dispatch = createEventDispatcher();
	let value = '';

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && value.trim()) {
			event.preventDefault();
			dispatch('submit', value.trim());
			value = '';
		}
	}

	function handleSubmit() {
		if (value.trim()) {
			dispatch('submit', value.trim());
			value = '';
		}
	}
</script>

<div class="flex items-center gap-2 bg-terminal-surface border border-terminal-border rounded px-4 py-3">
	<span class="text-terminal-green font-bold">{'>'}</span>
	<input
		type="text"
		bind:value
		on:keydown={handleKeydown}
		{placeholder}
		{disabled}
		class="flex-1 bg-transparent text-terminal-text placeholder-terminal-dim outline-none font-mono"
	/>
	<button
		on:click={handleSubmit}
		disabled={disabled || !value.trim()}
		class="text-terminal-green hover:text-terminal-green-bright disabled:text-terminal-dim disabled:cursor-not-allowed transition-colors"
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path
				fill-rule="evenodd"
				d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>
</div>
{#if disabled}
	<div class="flex items-center gap-2 mt-2 text-terminal-dim text-sm">
		<span class="cursor-blink">_</span>
		<span>Processing...</span>
	</div>
{/if}
