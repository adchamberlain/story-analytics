<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import Message from './Message.svelte';
	import TerminalInput from './TerminalInput.svelte';
	import {
		messages,
		phase,
		conversationLoading,
		lastDashboard,
		currentTitle,
		currentSessionId,
		sendMessage,
		loadConversation,
		loadConversationList,
		startNewConversation,
		renameConversation
	} from '../stores/conversation';

	let messagesContainer: HTMLDivElement;
	let isEditingTitle = false;
	let editingTitle = '';

	onMount(() => {
		loadConversation();
		loadConversationList();
	});

	function startEditingTitle() {
		isEditingTitle = true;
		editingTitle = $currentTitle || '';
	}

	async function saveTitle() {
		if (editingTitle.trim() && $currentSessionId) {
			await renameConversation($currentSessionId, editingTitle.trim());
		}
		isEditingTitle = false;
	}

	function cancelEditTitle() {
		isEditingTitle = false;
		editingTitle = '';
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			saveTitle();
		} else if (event.key === 'Escape') {
			cancelEditTitle();
		}
	}

	afterUpdate(() => {
		// Scroll to bottom when new messages arrive
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	async function handleSubmit(event: CustomEvent<string>) {
		await sendMessage(event.detail);
	}

	function handleNewConversation() {
		startNewConversation();
	}

	function getPhaseLabel(p: string): string {
		const labels: Record<string, string> = {
			intent: 'Starting',
			context: 'Understanding context',
			generation: 'Generating dashboard',
			refinement: 'Refining'
		};
		return labels[p] || p;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
		<div class="flex items-center gap-3 min-w-0 flex-1">
			{#if isEditingTitle}
				<input
					type="text"
					bind:value={editingTitle}
					on:keydown={handleTitleKeydown}
					on:blur={saveTitle}
					class="text-terminal-green font-bold bg-terminal-bg border border-terminal-green rounded px-2 py-0.5 outline-none"
					autofocus
				/>
			{:else}
				<h2
					class="text-terminal-green font-bold truncate cursor-pointer hover:underline"
					on:dblclick={startEditingTitle}
					title="Double-click to rename"
				>
					{$currentTitle || 'New conversation'}
				</h2>
			{/if}
			<span class="text-terminal-dim text-sm whitespace-nowrap">Phase: {getPhaseLabel($phase)}</span>
		</div>
		<button
			on:click={handleNewConversation}
			class="text-sm text-terminal-dim hover:text-terminal-text transition-colors whitespace-nowrap ml-2"
		>
			+ New
		</button>
	</div>

	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 py-4 space-y-2">
		{#if $messages.length === 0}
			<div class="text-terminal-dim text-center py-8">
				<p class="mb-2">Welcome to Story Analytics</p>
				<p class="text-sm">
					Tell me what kind of dashboard you'd like to create, and I'll help you build it.
				</p>
			</div>
		{:else}
			{#each $messages as message}
				<Message {message} />
			{/each}
		{/if}

		{#if $lastDashboard?.created}
			<div class="mt-4 p-4 bg-terminal-surface border border-terminal-green rounded">
				<p class="text-terminal-green mb-2">Dashboard created!</p>
				<a
					href={$lastDashboard.url}
					target="_blank"
					rel="noopener noreferrer"
					class="text-terminal-amber hover:underline"
				>
					{$lastDashboard.url}
				</a>
			</div>
		{/if}
	</div>

	<!-- Input -->
	<div class="px-4 py-4 border-t border-terminal-border">
		<TerminalInput
			on:submit={handleSubmit}
			disabled={$conversationLoading}
			placeholder="Describe the dashboard you want to create..."
		/>
	</div>
</div>
