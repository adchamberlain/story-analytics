<script lang="ts">
	import type { QAResult } from '../types';

	export let qaResult: QAResult;
	export let screenshotBaseUrl: string = 'http://localhost:8000';

	let showDetails = false;
	let showScreenshot = false;

	$: hasIssues = qaResult.critical_issues.length > 0;
	$: hasSuggestions = qaResult.suggestions.length > 0;
	$: hasFixedIssues = qaResult.issues_fixed.length > 0;

	function toggleDetails() {
		showDetails = !showDetails;
	}

	function toggleScreenshot() {
		showScreenshot = !showScreenshot;
	}

	function getScreenshotUrl(): string | null {
		if (!qaResult.screenshot_url) return null;
		return `${screenshotBaseUrl}${qaResult.screenshot_url}`;
	}
</script>

<div class="mt-4 border border-terminal-border rounded overflow-hidden">
	<!-- Header -->
	<button
		type="button"
		class="w-full px-4 py-3 flex items-center justify-between text-left transition-colors
			{qaResult.passed ? 'bg-terminal-surface hover:bg-terminal-surface/80' : 'bg-red-900/20 hover:bg-red-900/30'}"
		on:click={toggleDetails}
	>
		<div class="flex items-center gap-3">
			{#if qaResult.passed}
				<span class="text-terminal-accent text-lg">&#10003;</span>
				<span class="text-terminal-accent font-medium">QA Passed</span>
			{:else}
				<span class="text-red-400 text-lg">&#10007;</span>
				<span class="text-red-400 font-medium">QA Issues Found</span>
			{/if}
			{#if hasFixedIssues}
				<span class="text-xs bg-terminal-accent/20 text-terminal-accent px-2 py-0.5 rounded">
					{qaResult.issues_fixed.length} auto-fixed
				</span>
			{/if}
		</div>
		<span class="text-terminal-dim text-sm">
			{showDetails ? '[-]' : '[+]'}
		</span>
	</button>

	<!-- Expandable Details -->
	{#if showDetails}
		<div class="px-4 py-3 border-t border-terminal-border bg-terminal-bg space-y-3">
			<!-- Summary -->
			<p class="text-terminal-dim text-sm">{qaResult.summary}</p>

			<!-- Auto-Fixed Issues -->
			{#if hasFixedIssues}
				<div>
					<h4 class="text-terminal-accent text-xs font-medium mb-2">Auto-fixed Issues:</h4>
					<ul class="space-y-1">
						{#each qaResult.issues_fixed as issue}
							<li class="text-terminal-text text-sm flex items-start gap-2">
								<span class="text-terminal-accent">&#10003;</span>
								<span class="line-through text-terminal-dim">{issue}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Critical Issues -->
			{#if hasIssues}
				<div>
					<h4 class="text-red-400 text-xs font-medium mb-2">Critical Issues:</h4>
					<ul class="space-y-1">
						{#each qaResult.critical_issues as issue}
							<li class="text-terminal-text text-sm flex items-start gap-2">
								<span class="text-red-400">&#8226;</span>
								<span>{issue}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Suggestions -->
			{#if hasSuggestions}
				<div>
					<h4 class="text-terminal-amber text-xs font-medium mb-2">Suggestions:</h4>
					<ul class="space-y-1">
						{#each qaResult.suggestions as suggestion}
							<li class="text-terminal-dim text-sm flex items-start gap-2">
								<span class="text-terminal-amber">&#8226;</span>
								<span>{suggestion}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Screenshot Preview -->
			{#if qaResult.screenshot_url}
				<div class="pt-2 border-t border-terminal-border">
					<button
						type="button"
						class="text-terminal-dim text-xs hover:text-terminal-text transition-colors"
						on:click={toggleScreenshot}
					>
						{showScreenshot ? 'Hide' : 'Show'} Screenshot Preview
					</button>

					{#if showScreenshot}
						<div class="mt-3 rounded overflow-hidden border border-terminal-border">
							<img
								src={getScreenshotUrl()}
								alt="Dashboard QA Screenshot"
								class="w-full"
								loading="lazy"
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
