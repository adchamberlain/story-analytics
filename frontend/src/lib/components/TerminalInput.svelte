<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
	import {
		currentSuggestion,
		loadSuggestions,
		startRotation,
		stopRotation
	} from '../stores/suggestions';

	export let placeholder: string | undefined = undefined;
	export let disabled = false;
	export let prefill = '';
	export let showSuggestions = true;

	const dispatch = createEventDispatcher();
	let value = '';
	let textareaEl: HTMLTextAreaElement;

	// Watch for prefill changes and update value
	$: if (prefill) {
		value = prefill;
		prefill = '';
		tick().then(autoResize);
	}

	// Computed placeholder - use provided, rotating suggestion, or default
	$: displayPlaceholder = placeholder || (showSuggestions ? $currentSuggestion : 'Type your message...');

	onMount(() => {
		if (showSuggestions && !placeholder) {
			loadSuggestions();
			startRotation();
		}
	});

	// React to showSuggestions changes
	$: if (showSuggestions && !placeholder) {
		startRotation();
	} else {
		stopRotation();
	}

	onDestroy(() => {
		stopRotation();
	});

	function autoResize() {
		if (textareaEl) {
			textareaEl.style.height = 'auto';
			textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && value.trim()) {
			event.preventDefault();
			dispatch('submit', value.trim());
			value = '';
			tick().then(autoResize);
		}
	}

	function handleInput() {
		autoResize();
	}

	function handleSubmit() {
		if (value.trim()) {
			dispatch('submit', value.trim());
			value = '';
			tick().then(autoResize);
		}
	}
</script>

<div class="flex items-start gap-2 bg-terminal-surface border border-terminal-border rounded px-4 py-3">
	<span class="text-terminal-accent font-bold pt-0.5">{'>'}</span>
	<textarea
		bind:this={textareaEl}
		bind:value
		on:keydown={handleKeydown}
		on:input={handleInput}
		placeholder={displayPlaceholder}
		{disabled}
		rows="1"
		class="flex-1 bg-transparent text-terminal-text placeholder-terminal-dim outline-none font-mono resize-none overflow-hidden leading-normal"
	></textarea>
	<button
		on:click={handleSubmit}
		disabled={disabled || !value.trim()}
		class="text-terminal-accent hover:text-terminal-accent-bright disabled:text-terminal-dim disabled:cursor-not-allowed transition-colors pt-0.5"
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
