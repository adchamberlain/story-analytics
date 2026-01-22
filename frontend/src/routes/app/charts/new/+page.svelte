<script lang="ts">
	/**
	 * New Chart Page - Create a chart through conversation.
	 */

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ChartChat from '$lib/components/ChartChat.svelte';
	import { chartPhase, chartSessionId, chartMessages, resetChartConversation, startNewChartConversation } from '$lib/stores/chart';
	import { get } from 'svelte/store';

	// Start fresh only if no session was pre-loaded (e.g., from sidebar click)
	onMount(() => {
		const currentSessionId = get(chartSessionId);
		const currentMessages = get(chartMessages);

		// If there's no session or no messages, start fresh
		if (!currentSessionId || currentMessages.length === 0) {
			resetChartConversation();
			startNewChartConversation();
		}
	});

	// Reset conversation when navigating away
	function handleBack() {
		resetChartConversation();
		goto('/app/charts');
	}

	// Handle completion - go to library
	$: if ($chartPhase === 'complete') {
		setTimeout(() => {
			resetChartConversation();
			goto('/app/charts');
		}, 1000);
	}
</script>

<svelte:head>
	<title>Create Chart | Story</title>
</svelte:head>

<div class="new-chart-page">
	<div class="page-header">
		<button class="back-btn" on:click={handleBack}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5" />
				<path d="M12 19l-7-7 7-7" />
			</svg>
			Back to Library
		</button>
		<h1>Create New Chart</h1>
	</div>

	<div class="chat-container">
		<ChartChat />
	</div>
</div>

<style>
	.new-chart-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0a0a0a;
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #2d2d44;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: #9ca3af;
		font-size: 0.875rem;
		cursor: pointer;
		padding: 0.5rem;
		margin: -0.5rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.back-btn:hover {
		color: #e5e7eb;
		background: #1e1e32;
	}

	.page-header h1 {
		margin: 0;
		font-size: 1.25rem;
		color: #e5e7eb;
	}

	.chat-container {
		flex: 1;
		overflow: hidden;
	}
</style>
