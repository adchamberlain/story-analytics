<script lang="ts">
	/**
	 * ChartNotification - Shows a toast when a chart completes in the background.
	 */

	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { chartNotification, clearChartNotification } from '$lib/stores/chart';

	let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleView() {
		if ($chartNotification?.chartUrl) {
			// Navigate to the chart creation page to see the result
			goto('/app/charts/new');
		}
		clearChartNotification();
	}

	function handleDismiss() {
		clearChartNotification();
	}

	// Auto-dismiss after 10 seconds when notification appears
	$: if ($chartNotification) {
		// Clear any existing timeout
		if (dismissTimeout) {
			clearTimeout(dismissTimeout);
		}
		dismissTimeout = setTimeout(() => {
			clearChartNotification();
		}, 10000);
	}

	// Cleanup on component destroy
	onDestroy(() => {
		if (dismissTimeout) {
			clearTimeout(dismissTimeout);
		}
	});
</script>

{#if $chartNotification}
	<div class="notification {$chartNotification.type}">
		<div class="notification-content">
			<span class="icon">
				{#if $chartNotification.type === 'success'}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				{/if}
			</span>
			<div class="text">
				<span class="message">{$chartNotification.message}</span>
				{#if $chartNotification.chartTitle}
					<span class="title">{$chartNotification.chartTitle}</span>
				{/if}
			</div>
		</div>
		<div class="actions">
			{#if $chartNotification.chartUrl}
				<button class="view-btn" on:click={handleView}>View</button>
			{/if}
			<button class="dismiss-btn" on:click={handleDismiss}>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.notification {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		animation: slideIn 0.3s ease-out;
		max-width: 400px;
	}

	@keyframes slideIn {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.notification.success {
		border-left: 3px solid #22c55e;
	}

	.notification.error {
		border-left: 3px solid #ef4444;
	}

	.notification-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notification.success .icon {
		color: #22c55e;
	}

	.notification.error .icon {
		color: #ef4444;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.message {
		font-size: 0.875rem;
		font-weight: 500;
		color: #e5e7eb;
	}

	.title {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.view-btn {
		padding: 0.375rem 0.75rem;
		background: #6366f1;
		border: none;
		border-radius: 4px;
		color: white;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.view-btn:hover {
		background: #5558e3;
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.dismiss-btn:hover {
		background: #2d2d44;
		color: #e5e7eb;
	}
</style>
