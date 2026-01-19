<script lang="ts">
	import { progressSteps, isStreaming, type ProgressStep } from '../stores/conversation';

	// Status icons
	function getStatusIcon(status: ProgressStep['status']): string {
		switch (status) {
			case 'completed':
				return '\u2713'; // checkmark
			case 'failed':
				return '\u2717'; // x mark
			case 'in_progress':
				return '\u25CF'; // filled circle (will animate)
			default:
				return '\u25CB'; // empty circle
		}
	}

	// Status colors
	function getStatusClass(status: ProgressStep['status']): string {
		switch (status) {
			case 'completed':
				return 'text-green-500';
			case 'failed':
				return 'text-red-500';
			case 'in_progress':
				return 'text-terminal-accent animate-pulse';
			default:
				return 'text-terminal-dim';
		}
	}
</script>

{#if $isStreaming && $progressSteps.length > 0}
	<div class="px-4 py-3 border-t border-terminal-border bg-terminal-surface/50">
		<div class="flex flex-col gap-1.5 text-sm font-mono">
			{#each $progressSteps as step (step.step)}
				<div class="flex items-center gap-2">
					<span class={`w-4 text-center ${getStatusClass(step.status)}`}>
						{getStatusIcon(step.status)}
					</span>
					<span class={step.status === 'in_progress' ? 'text-terminal-text' : 'text-terminal-dim'}>
						{step.message}
					</span>
					{#if step.details && step.status === 'completed'}
						<span class="text-terminal-dim text-xs">({step.details})</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
