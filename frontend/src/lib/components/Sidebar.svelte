<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '../stores/auth';
	import { dashboards, loadDashboards } from '../stores/dashboards';
	import {
		conversationList,
		currentSessionId,
		loadConversationList,
		switchConversation,
		startNewConversation,
		deleteConversation,
		renameConversation
	} from '../stores/conversation';
	import { chartSessionId, loadChartConversation } from '../stores/chart';
	import { tables, loadSchema } from '../stores/schema';
	import { logout, deleteConversation as apiDeleteConversation } from '../api';
	import type { ConversationSummary } from '../types';

	export let currentPath: string = '/app';

	let showDashboards = true;
	let showConversations = true;
	let showData = false;
	let editingId: number | null = null;
	let editingTitle = '';

	onMount(() => {
		loadDashboards();
		loadConversationList();
		loadSchema();
	});

	function toggleData() {
		showData = !showData;
	}

	function handleLogout() {
		logout();
	}

	function toggleDashboards() {
		showDashboards = !showDashboards;
	}

	function toggleConversations() {
		showConversations = !showConversations;
	}

	async function handleSwitchConversation(conv: ConversationSummary) {
		if (conv.conversation_type === 'chart') {
			// For chart conversations, navigate to the chart page and load that conversation
			await loadChartConversation(conv.id);
			goto('/app/charts/new');
		} else {
			// For dashboard conversations, use the existing behavior
			await switchConversation(conv.id);
			goto('/app');
		}
	}

	async function handleNewConversation() {
		await startNewConversation();
	}

	async function handleDeleteConversation(event: Event, conv: ConversationSummary) {
		event.stopPropagation();
		if (confirm('Delete this conversation?')) {
			if (conv.conversation_type === 'chart') {
				// For chart conversations, delete directly
				await apiDeleteConversation(conv.id);
				await loadConversationList();
			} else {
				await deleteConversation(conv.id);
			}
		}
	}

	function startEditing(event: Event, sessionId: number, currentTitle: string | null) {
		event.stopPropagation();
		editingId = sessionId;
		editingTitle = currentTitle || '';
	}

	async function saveEdit(sessionId: number) {
		if (editingTitle.trim()) {
			await renameConversation(sessionId, editingTitle.trim());
		}
		editingId = null;
		editingTitle = '';
	}

	function cancelEdit() {
		editingId = null;
		editingTitle = '';
	}

	function handleEditKeydown(event: KeyboardEvent, sessionId: number) {
		if (event.key === 'Enter') {
			saveEdit(sessionId);
		} else if (event.key === 'Escape') {
			cancelEdit();
		}
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	}

	const navItems = [
		{ path: '/app', label: 'Chat', icon: '>' },
		{ path: '/app/charts', label: 'Charts', icon: '~' },
		{ path: '/app/dashboards', label: 'Dashboards', icon: '#' },
		{ path: '/app/settings', label: 'Settings', icon: '*' }
	];
</script>

<aside class="w-64 h-full bg-terminal-surface border-r border-terminal-border flex flex-col">
	<!-- Logo -->
	<div class="p-4 border-b border-terminal-border">
		<h1 class="text-terminal-accent font-bold text-xl tracking-widest">
			STORY<span class="inline-block w-2 h-5 bg-terminal-accent ml-1 align-middle cursor-blink"></span><span class="inline-block w-2 h-5 bg-terminal-accent ml-0.5 align-middle cursor-blink"></span>
		</h1>
		<p class="text-terminal-dim text-xs mt-1">AI-native analytics.</p>
	</div>

	<!-- Navigation -->
	<nav class="flex-1 p-4">
		<ul class="space-y-1">
			{#each navItems as item}
				<li>
					<a
						href={item.path}
						class="flex items-center gap-2 px-3 py-2 rounded transition-colors
                           {currentPath === item.path
							? 'bg-terminal-border text-terminal-accent'
							: 'text-terminal-text hover:bg-terminal-border'}"
					>
						<span class="text-terminal-amber">{item.icon}</span>
						<span>{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>

		<!-- Conversations list -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-2">
				<button
					on:click={toggleConversations}
					class="flex items-center gap-2 text-terminal-dim text-sm hover:text-terminal-text transition-colors"
				>
					<span class="transform transition-transform {showConversations ? 'rotate-90' : ''}"
						>{'>'}</span
					>
					<span>Conversations</span>
				</button>
				<button
					on:click={handleNewConversation}
					class="text-terminal-accent hover:text-terminal-text text-sm transition-colors"
					title="New conversation"
				>
					+
				</button>
			</div>

			{#if showConversations}
				<ul class="ml-4 space-y-1 max-h-48 overflow-y-auto">
					{#if $conversationList.length === 0}
						<li class="text-terminal-dim text-xs py-1">No conversations yet</li>
					{:else}
						{#each $conversationList as conv}
							<li class="group flex items-center justify-between">
								{#if editingId === conv.id}
									<input
										type="text"
										bind:value={editingTitle}
										on:keydown={(e) => handleEditKeydown(e, conv.id)}
										on:blur={() => saveEdit(conv.id)}
										class="text-sm py-0.5 px-1 flex-1 bg-terminal-bg border border-terminal-accent rounded text-terminal-text outline-none"
										autofocus
									/>
								{:else}
									<button
										on:click={() => handleSwitchConversation(conv)}
										on:dblclick={(e) => startEditing(e, conv.id, conv.title)}
										class="text-sm truncate py-1 flex-1 text-left transition-colors flex items-center gap-1
	                                        {($currentSessionId === conv.id && conv.conversation_type === 'dashboard') ||
												($chartSessionId === conv.id && conv.conversation_type === 'chart')
											? 'text-terminal-accent'
											: 'text-terminal-dim hover:text-terminal-text'}"
										title="Double-click to rename"
									>
										{#if conv.conversation_type === 'chart'}
											<span class="text-terminal-amber text-xs" title="Chart conversation">~</span>
										{:else}
											<span class="text-terminal-dim text-xs">#</span>
										{/if}
										<span class="truncate">{conv.title || 'New conversation'}</span>
									</button>
									<button
										on:click={(e) => handleDeleteConversation(e, conv)}
										class="text-terminal-dim hover:text-terminal-red text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1"
										title="Delete conversation"
									>
										×
									</button>
								{/if}
							</li>
						{/each}
					{/if}
				</ul>
			{/if}
		</div>

		<!-- Dashboard list -->
		<div class="mt-6">
			<button
				on:click={toggleDashboards}
				class="flex items-center gap-2 text-terminal-dim text-sm hover:text-terminal-text transition-colors w-full"
			>
				<span class="transform transition-transform {showDashboards ? 'rotate-90' : ''}"
					>{'>'}</span
				>
				<span>Recent Dashboards</span>
			</button>

			{#if showDashboards}
				<ul class="mt-2 ml-4 space-y-1">
					{#if $dashboards.length === 0}
						<li class="text-terminal-dim text-xs py-1">No dashboards yet</li>
					{:else}
						{#each $dashboards.slice(0, 5) as dashboard}
							<li>
								<a
									href={dashboard.url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm text-terminal-dim hover:text-terminal-accent truncate block py-1"
									title={dashboard.title}
								>
									{dashboard.title}
								</a>
							</li>
						{/each}
						{#if $dashboards.length > 5}
							<li>
								<a href="/app/dashboards" class="text-xs text-terminal-amber hover:underline">
									View all ({$dashboards.length})
								</a>
							</li>
						{/if}
					{/if}
				</ul>
			{/if}
		</div>

		<!-- Available Data -->
		<div class="mt-6">
			<button
				on:click={toggleData}
				class="flex items-center gap-2 text-terminal-dim text-sm hover:text-terminal-text transition-colors w-full"
			>
				<span class="transform transition-transform {showData ? 'rotate-90' : ''}"
					>{'>'}</span
				>
				<span>Available Data</span>
			</button>

			{#if showData}
				<ul class="mt-2 ml-4 space-y-1 max-h-48 overflow-y-auto">
					{#if $tables.length === 0}
						<li class="text-terminal-dim text-xs py-1">No tables found</li>
					{:else}
						{#each $tables as table}
							<li class="group">
								<details class="text-sm">
									<summary class="text-terminal-dim hover:text-terminal-text cursor-pointer py-1 list-none flex items-center gap-1">
										<span class="text-terminal-amber text-xs">+</span>
										<span class="truncate">{table.name}</span>
										<span class="text-terminal-dim text-xs">({table.columns.length})</span>
									</summary>
									<ul class="ml-4 text-xs text-terminal-dim space-y-0.5 pb-1">
										{#each table.columns.slice(0, 8) as column}
											<li class="truncate" title="{column.name}: {column.type}">
												<span class="text-terminal-text">{column.name}</span>
												<span class="text-terminal-dim ml-1">{column.type}</span>
											</li>
										{/each}
										{#if table.columns.length > 8}
											<li class="text-terminal-dim italic">
												+{table.columns.length - 8} more columns
											</li>
										{/if}
									</ul>
								</details>
							</li>
						{/each}
					{/if}
				</ul>
			{/if}
		</div>
	</nav>

	<!-- User info -->
	<div class="p-4 border-t border-terminal-border group/user">
		{#if $user}
			<div class="flex items-center justify-between">
				<div class="truncate">
					<p class="text-terminal-text text-sm truncate">{$user.name}</p>
					<p class="text-terminal-dim text-xs truncate">{$user.email}</p>
				</div>
				<button
					on:click={handleLogout}
					class="text-terminal-dim hover:text-terminal-red text-xs transition-all opacity-0 group-hover/user:opacity-100"
				>
					Log out
				</button>
			</div>
		{/if}
	</div>
</aside>
