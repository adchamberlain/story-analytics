<script lang="ts">
	/**
	 * ChartChat - Simplified chat interface for chart-first creation.
	 *
	 * Features:
	 * - Single-chart focused conversation
	 * - Inline chart preview via iframe
	 * - Action buttons for flow control
	 */

	import { onMount } from 'svelte';
	import ChartEmbed from './ChartEmbed.svelte';
	import TerminalInput from './TerminalInput.svelte';
	import {
		chartMessages,
		chartPhase,
		chartLoading,
		currentChartUrl,
		currentChartTitle,
		chartActionButtons,
		sendChartMessage,
		startNewChartConversation
	} from '../stores/chart';

	let messagesContainer: HTMLDivElement;

	// Auto-scroll to bottom on new messages
	$: if ($chartMessages.length && messagesContainer) {
		setTimeout(() => {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}, 100);
	}

	onMount(async () => {
		// Start a new conversation if none exists
		if ($chartMessages.length === 0) {
			await startNewChartConversation();
		}
	});

	async function handleSubmit(event: CustomEvent<string>) {
		const message = event.detail;
		if (!message.trim()) return;
		await sendChartMessage(message);
	}

	async function handleActionClick(actionId: string) {
		// Send action as a special message
		await sendChartMessage(`__action:${actionId}`);
	}

	function getLoadingMessage(): string {
		switch ($chartPhase) {
			case 'generating':
				return 'Generating your chart...';
			case 'viewing':
				return 'Updating chart...';
			default:
				return 'Thinking...';
		}
	}
</script>

<div class="chart-chat">
	<!-- Messages area -->
	<div class="messages" bind:this={messagesContainer}>
		{#each $chartMessages as message, i}
			<div class="message {message.role}">
				<div class="message-content">
					{@html message.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
				</div>

				<!-- Show chart embed if this message has a chart URL -->
				{#if message.chartUrl}
					<div class="chart-preview">
						<ChartEmbed
							url={message.chartUrl}
							title={$currentChartTitle || 'Chart'}
							height="350px"
						/>
					</div>
				{/if}

				<!-- Show action buttons on last assistant message -->
				{#if message.role === 'assistant' && i === $chartMessages.length - 1 && message.actionButtons}
					<div class="action-buttons">
						{#each message.actionButtons as button}
							<button
								class="action-btn {button.style}"
								on:click={() => handleActionClick(button.id)}
								disabled={$chartLoading}
							>
								{button.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/each}

		<!-- Loading indicator -->
		{#if $chartLoading}
			<div class="message assistant">
				<div class="message-content loading">
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
					<span class="loading-text">{getLoadingMessage()}</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Input area -->
	<div class="input-area">
		<TerminalInput
			on:submit={handleSubmit}
			disabled={$chartLoading}
			placeholder={$chartPhase === 'viewing'
				? 'Describe changes or say "done"...'
				: 'Describe the chart you want to create...'}
		/>
	</div>

	<!-- Current chart indicator (if viewing) -->
	{#if $currentChartUrl && $chartPhase === 'viewing'}
		<div class="current-chart-indicator">
			<span class="dot"></span>
			<span>Viewing: {$currentChartTitle || 'Chart'}</span>
		</div>
	{/if}
</div>

<style>
	.chart-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0f0f1a;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.message {
		max-width: 85%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-content {
		padding: 0.75rem 1rem;
		border-radius: 12px;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.message.user .message-content {
		background: #6366f1;
		color: white;
		border-bottom-right-radius: 4px;
	}

	.message.assistant .message-content {
		background: #1e1e32;
		color: #e5e7eb;
		border-bottom-left-radius: 4px;
	}

	.message-content :global(strong) {
		font-weight: 600;
		color: inherit;
	}

	.chart-preview {
		width: 100%;
		max-width: 600px;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.action-btn {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.action-btn.primary {
		background: #6366f1;
		color: white;
	}

	.action-btn.primary:hover:not(:disabled) {
		background: #5558e3;
	}

	.action-btn.secondary {
		background: #2d2d44;
		color: #9ca3af;
	}

	.action-btn.secondary:hover:not(:disabled) {
		background: #3d3d54;
		color: #e5e7eb;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.message-content.loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		background: #6366f1;
		border-radius: 50%;
		animation: typing 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%, 60%, 100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-4px);
		}
	}

	.loading-text {
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.input-area {
		padding: 1rem;
		border-top: 1px solid #2d2d44;
		background: #1a1a2e;
	}

	.current-chart-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #1e1e32;
		border-top: 1px solid #2d2d44;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.dot {
		width: 8px;
		height: 8px;
		background: #22c55e;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
