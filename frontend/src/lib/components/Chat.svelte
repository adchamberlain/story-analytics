<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { goto } from '$app/navigation';
	import Message from './Message.svelte';
	import TerminalInput from './TerminalInput.svelte';
	import TemplateCard from './TemplateCard.svelte';
	import { getDashboard, type Dashboard } from '../api';
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
	import { templates, templatesLoading, loadTemplates } from '../stores/templates';
	import { tables, schemaLoading, loadSchema } from '../stores/schema';

	export let editSlug: string | null = null;

	let messagesContainer: HTMLDivElement;
	let isEditingTitle = false;
	let editingTitle = '';
	let editingDashboard: Dashboard | null = null;
	let pendingInput = '';

	onMount(async () => {
		loadConversation();
		loadConversationList();
		loadTemplates();
		loadSchema();

		// If editing a dashboard, load its info
		if (editSlug) {
			try {
				editingDashboard = await getDashboard(editSlug);
			} catch (e) {
				console.error('Failed to load dashboard for editing:', e);
			}
		}
	});

	function handleTemplateSelect(event: CustomEvent<{ prompt: string }>) {
		pendingInput = event.detail.prompt;
	}

	function handleTableClick(tableName: string) {
		pendingInput = `Create a dashboard using the ${tableName} table`;
	}

	function handleOptionSelect(event: CustomEvent<{ value: string }>) {
		pendingInput = event.detail.value;
	}

	function clearEditMode() {
		editingDashboard = null;
		goto('/app', { replaceState: true });
	}

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
					class="text-terminal-accent font-bold bg-terminal-bg border border-terminal-accent rounded px-2 py-0.5 outline-none"
					autofocus
				/>
			{:else}
				<h2
					class="text-terminal-accent font-bold text-lg truncate cursor-pointer hover:underline"
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

	<!-- Edit Mode Banner -->
	{#if editingDashboard}
		<div class="px-4 py-3 bg-terminal-accent/10 border-b border-terminal-accent/30 flex items-center justify-between">
			<div>
				<span class="text-terminal-accent font-medium">Editing:</span>
				<span class="text-terminal-text ml-2">{editingDashboard.title}</span>
			</div>
			<button
				on:click={clearEditMode}
				class="text-terminal-dim hover:text-terminal-text text-sm"
			>
				Cancel edit
			</button>
		</div>
	{/if}

	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 py-4 space-y-2">
		{#if $messages.length === 0}
			<div class="text-terminal-dim py-8">
				{#if editingDashboard}
					<div class="text-center">
						<p class="mb-2 text-terminal-text">Editing: <span class="text-terminal-accent">{editingDashboard.title}</span></p>
						<p class="text-sm mb-4">
							Describe what changes you'd like to make to this dashboard.
						</p>
						<div class="text-xs text-terminal-dim space-y-1">
							<p>Examples:</p>
							<p class="italic">"Add a filter for date range"</p>
							<p class="italic">"Change the chart to show monthly trends"</p>
							<p class="italic">"Add a second chart showing revenue by region"</p>
						</div>
					</div>
				{:else}
					<div class="text-center mb-6">
						<p class="mb-2">Welcome to Story Analytics</p>
						<p class="text-sm">
							Tell me what kind of dashboard you'd like to create, or choose a template below.
						</p>
					</div>

					<!-- Available Data Chips -->
					{#if $tables.length > 0}
						<div class="mb-6">
							<p class="text-terminal-dim text-xs mb-2 text-center">Available data:</p>
							<div class="flex flex-wrap justify-center gap-2">
								{#each $tables.slice(0, 6) as table}
									<button
										type="button"
										on:click={() => handleTableClick(table.name)}
										class="px-2 py-1 text-xs bg-terminal-surface border border-terminal-border rounded
                                               hover:border-terminal-accent hover:text-terminal-accent transition-colors"
									>
										{table.name}
									</button>
								{/each}
								{#if $tables.length > 6}
									<span class="px-2 py-1 text-xs text-terminal-dim">
										+{$tables.length - 6} more
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Template Cards -->
					{#if $templates.length > 0}
						<div>
							<p class="text-terminal-dim text-xs mb-3 text-center">Quick start templates:</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
								{#each $templates.slice(0, 4) as template}
									<TemplateCard {template} on:select={handleTemplateSelect} />
								{/each}
							</div>
						</div>
					{:else if $templatesLoading}
						<div class="text-center text-terminal-dim text-sm">
							Loading templates...
						</div>
					{/if}
				{/if}
			</div>
		{:else}
			{#each $messages as message}
				<Message {message} on:optionSelect={handleOptionSelect} />
			{/each}
		{/if}

		{#if $lastDashboard?.created}
			<div class="mt-4 p-4 bg-terminal-surface border border-terminal-accent rounded">
				<p class="text-terminal-accent mb-2">Dashboard created!</p>
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
			placeholder={editingDashboard
				? "Describe what changes you'd like to make..."
				: undefined}
			bind:prefill={pendingInput}
		/>
	</div>
</div>
