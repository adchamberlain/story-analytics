<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { goto } from '$app/navigation';
	import Message from './Message.svelte';
	import TerminalInput from './TerminalInput.svelte';
	import TemplateCard from './TemplateCard.svelte';
	import QAResultPanel from './QAResultPanel.svelte';
	import ProgressSteps from './ProgressSteps.svelte';
	import { getDashboard, type Dashboard } from '../api';
	import {
		messages,
		phase,
		conversationLoading,
		conversationComplete,
		lastDashboard,
		currentTitle,
		currentSessionId,
		sendMessage,
		loadConversation,
		loadConversationList,
		startNewConversation,
		renameConversation
	} from '../stores/conversation';
	import { templates, loadTemplates } from '../stores/templates';
	import { justLoggedIn, clearJustLoggedIn } from '../stores/auth';

	export let editSlug: string | null = null;

	let messagesContainer: HTMLDivElement;
	let isEditingTitle = false;
	let editingTitle = '';
	let editingDashboard: Dashboard | null = null;
	let pendingInput = '';

	// Show templates when awaiting user's first description in CONTEXT phase
	$: showTemplates = $phase === 'context'
		&& $messages.length === 1
		&& $messages[0]?.role === 'assistant'
		&& !$messages[0]?.action_buttons;

	// Show rotating suggestions only in early context phase (before user has described their dashboard)
	$: showSuggestions = !editingDashboard
		&& $phase === 'context'
		&& $messages.length <= 2;

	// Compute phase-aware loading message
	$: loadingMessage = getLoadingMessage($phase, $messages.length);

	function getLoadingMessage(currentPhase: string, messageCount: number): string {
		switch (currentPhase) {
			case 'intent':
				return 'Understanding your request...';
			case 'context':
				// First user message creates plan, subsequent ones update it
				if (messageCount <= 2) {
					return 'Creating your dashboard plan...';
				}
				return 'Updating the plan...';
			case 'generation':
				return 'Generating dashboard...';
			case 'refinement':
				return 'Applying your changes...';
			default:
				return 'Processing...';
		}
	}

	onMount(async () => {
		// If user just logged in, start with a fresh conversation
		if ($justLoggedIn) {
			clearJustLoggedIn();
			await startNewConversation();
		} else {
			await loadConversation();
		}

		loadConversationList();
		loadTemplates();

		// If editing a dashboard, load its info
		if (editSlug) {
			try {
				editingDashboard = await getDashboard(editSlug);
			} catch (e) {
				console.error('Failed to load dashboard for editing:', e);
			}
		}
	});

	function handleOptionSelect(event: CustomEvent<{ value: string }>) {
		pendingInput = event.detail.value;
	}

	function handleTemplateSelect(event: CustomEvent<{ prompt: string }>) {
		pendingInput = event.detail.prompt;
	}

	async function handleActionClick(event: CustomEvent<{ id: string }>) {
		const actionId = event.detail.id;

		// Handle view_dashboard action specially - open URL in new tab
		if (actionId.startsWith('view_dashboard:')) {
			const url = actionId.slice('view_dashboard:'.length);
			window.open(url, '_blank');
			return;
		}

		// Handle navigation actions - route to appropriate pages
		if (actionId === 'create_chart') {
			goto('/app/charts/new');
			return;
		}
		if (actionId === 'find_chart') {
			goto('/app/charts');
			return;
		}
		if (actionId === 'find_dashboard') {
			goto('/app/dashboards');
			return;
		}
		if (actionId === 'create_dashboard') {
			// Use existing create flow via backend
			await sendMessage('__action:create_new');
			return;
		}

		// Send action with special prefix to backend
		await sendMessage(`__action:${actionId}`);
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
			refinement: 'Refining',
			complete: 'Complete'
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
					<div class="text-center">
						<p class="mb-2">Welcome to Story Analytics</p>
						<p class="text-sm text-terminal-dim mb-6">
							What would you like to do?
						</p>
						<div class="flex flex-col sm:flex-row justify-center gap-6 max-w-2xl mx-auto">
							<!-- Charts Section -->
							<div class="flex-1 p-4 bg-terminal-surface border border-terminal-border rounded">
								<h3 class="text-terminal-accent font-medium mb-3">Charts</h3>
								<div class="flex flex-col gap-2">
									<button
										type="button"
										on:click={() => handleActionClick({ detail: { id: 'create_chart' } })}
										class="px-4 py-2 text-sm font-medium rounded transition-colors
											bg-terminal-accent text-terminal-bg hover:bg-terminal-accent/80"
									>
										Create New Chart
									</button>
									<button
										type="button"
										on:click={() => handleActionClick({ detail: { id: 'find_chart' } })}
										class="px-4 py-2 text-sm font-medium rounded transition-colors
											bg-terminal-surface border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent"
									>
										Find / Edit Chart
									</button>
								</div>
							</div>
							<!-- Dashboards Section -->
							<div class="flex-1 p-4 bg-terminal-surface border border-terminal-border rounded">
								<h3 class="text-terminal-accent font-medium mb-3">Dashboards</h3>
								<div class="flex flex-col gap-2">
									<button
										type="button"
										on:click={() => handleActionClick({ detail: { id: 'create_dashboard' } })}
										class="px-4 py-2 text-sm font-medium rounded transition-colors
											bg-terminal-accent text-terminal-bg hover:bg-terminal-accent/80"
									>
										Create New Dashboard
									</button>
									<button
										type="button"
										on:click={() => handleActionClick({ detail: { id: 'find_dashboard' } })}
										class="px-4 py-2 text-sm font-medium rounded transition-colors
											bg-terminal-surface border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent"
									>
										Find / Edit Dashboard
									</button>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			{#each $messages as message}
				<Message {message} disabled={$conversationLoading || $conversationComplete} on:optionSelect={handleOptionSelect} on:actionClick={handleActionClick} />
			{/each}

			<!-- Show templates when awaiting user's first input -->
			{#if showTemplates && $templates.length > 0}
				<div class="mt-6 pl-4">
					<p class="text-terminal-dim text-xs mb-3">Or choose a quick start template:</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
						{#each $templates.slice(0, 4) as template}
							<TemplateCard {template} on:select={handleTemplateSelect} />
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		{#if $lastDashboard?.created && !$conversationComplete}
			<div class="mt-4 p-4 bg-terminal-surface border border-terminal-accent rounded">
				<div class="flex items-center justify-between mb-3">
					<p class="text-terminal-accent font-medium">Dashboard created!</p>
					<div class="flex gap-2">
						<a
							href={$lastDashboard.url}
							target="_blank"
							rel="noopener noreferrer"
							class="px-3 py-1.5 text-xs font-medium rounded transition-colors
								bg-terminal-accent text-terminal-bg hover:bg-terminal-accent/80"
						>
							Open Preview
						</a>
						{#if $lastDashboard.slug}
							<a
								href="/app/dashboards/edit/{$lastDashboard.slug}"
								class="px-3 py-1.5 text-xs font-medium rounded transition-colors
									bg-terminal-surface border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent"
							>
								Edit Code
							</a>
						{/if}
					</div>
				</div>
				<a
					href={$lastDashboard.url}
					target="_blank"
					rel="noopener noreferrer"
					class="text-terminal-amber hover:underline text-sm"
				>
					{$lastDashboard.url}
				</a>

				<!-- QA Results Panel -->
				{#if $lastDashboard.qa_result}
					<QAResultPanel qaResult={$lastDashboard.qa_result} />
				{/if}
			</div>
		{/if}
	</div>

	<!-- Progress Steps (shown during streaming generation) -->
	<ProgressSteps />

	<!-- Input -->
	<div class="px-4 py-4 border-t border-terminal-border">
		<TerminalInput
			on:submit={handleSubmit}
			disabled={$conversationLoading}
			placeholder={editingDashboard
				? "Describe what changes you'd like to make..."
				: undefined}
			bind:prefill={pendingInput}
			{showSuggestions}
			{loadingMessage}
		/>
	</div>
</div>
