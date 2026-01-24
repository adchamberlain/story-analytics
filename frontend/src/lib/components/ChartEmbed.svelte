<script lang="ts">
	/**
	 * ChartEmbed - Embeds a chart via iframe.
	 *
	 * Supports two renderers:
	 * - Evidence (port 3000) - legacy markdown-based rendering
	 * - React + Plotly.js (port 3001) - new direct rendering
	 *
	 * Features:
	 * - Responsive sizing
	 * - Loading state
	 * - Error handling
	 * - Full-screen toggle
	 * - Renderer toggle (Evidence vs React)
	 */

	import { createEventDispatcher } from 'svelte';
	import { chartRenderer, toggleRenderer, getChartUrl, getChartFullUrl } from '$lib/stores/settings';

	// Props
	export let url: string; // Evidence URL (e.g., http://localhost:3000/{slug}?embed=true)
	export let title: string = 'Chart';
	export let height: string = '400px';
	export let showToolbar: boolean = true;
	export let chartId: string | undefined = undefined; // Optional chart ID for React renderer

	const dispatch = createEventDispatcher();

	let loading = true;
	let error = false;
	let fullscreen = false;
	let iframeElement: HTMLIFrameElement;

	// Extract slug from Evidence URL
	$: slug = extractSlug(url);

	// Compute the actual URL based on renderer
	$: actualUrl = getChartUrl(slug, chartId);

	function extractSlug(evidenceUrl: string): string {
		// Extract slug from URL like "http://localhost:3000/{slug}?embed=true"
		try {
			const urlObj = new URL(evidenceUrl);
			// Remove leading slash and query params
			return urlObj.pathname.replace(/^\//, '');
		} catch {
			// If URL parsing fails, try simple extraction
			const match = evidenceUrl.match(/localhost:\d+\/([^?]+)/);
			return match ? match[1] : '';
		}
	}

	function handleLoad() {
		loading = false;
		error = false;
	}

	function handleError() {
		loading = false;
		error = true;
	}

	function toggleFullscreen() {
		fullscreen = !fullscreen;
		dispatch('fullscreen', { fullscreen });
	}

	function openInNewTab() {
		const fullUrl = getChartFullUrl(slug, chartId);
		window.open(fullUrl, '_blank');
	}

	function refresh() {
		loading = true;
		error = false;
		// Force iframe reload
		if (iframeElement) {
			const currentSrc = iframeElement.src;
			iframeElement.src = '';
			setTimeout(() => {
				iframeElement.src = currentSrc;
			}, 100);
		}
	}

	function handleToggleRenderer() {
		loading = true;
		error = false;
		toggleRenderer();
	}

	// React to renderer changes - reload iframe
	$: if ($chartRenderer && iframeElement) {
		loading = true;
		error = false;
	}
</script>

<div
	class="chart-embed"
	class:fullscreen
	style:height={fullscreen ? '100vh' : height}
>
	{#if showToolbar}
		<div class="toolbar">
			<span class="title">{title}</span>
			<div class="actions">
				<!-- Renderer toggle -->
				<button
					class="renderer-toggle"
					class:react={$chartRenderer === 'react'}
					on:click={handleToggleRenderer}
					title={$chartRenderer === 'react' ? 'Using React (click for Evidence)' : 'Using Evidence (click for React)'}
				>
					{#if $chartRenderer === 'react'}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/>
							<circle cx="12" cy="12" r="4"/>
							<line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
							<line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
							<line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
							<line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
						</svg>
						<span>React</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 2L2 7l10 5 10-5-10-5z"/>
							<path d="M2 17l10 5 10-5"/>
							<path d="M2 12l10 5 10-5"/>
						</svg>
						<span>Evidence</span>
					{/if}
				</button>

				<div class="separator"></div>

				<button
					class="action-btn"
					on:click={refresh}
					title="Refresh"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
						<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
						<path d="M16 16h5v5" />
					</svg>
				</button>
				<button
					class="action-btn"
					on:click={toggleFullscreen}
					title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				>
					{#if fullscreen}
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M8 3v3a2 2 0 0 1-2 2H3" />
							<path d="M21 8h-3a2 2 0 0 1-2-2V3" />
							<path d="M3 16h3a2 2 0 0 1 2 2v3" />
							<path d="M16 21v-3a2 2 0 0 1 2-2h3" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3 8V5a2 2 0 0 1 2-2h3" />
							<path d="M21 8V5a2 2 0 0 0-2-2h-3" />
							<path d="M3 16v3a2 2 0 0 0 2 2h3" />
							<path d="M21 16v3a2 2 0 0 1-2 2h-3" />
						</svg>
					{/if}
				</button>
				<button
					class="action-btn"
					on:click={openInNewTab}
					title="Open in new tab"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</button>
			</div>
		</div>
	{/if}

	<div class="iframe-container">
		{#if loading}
			<div class="loading">
				<div class="spinner"></div>
				<span>Loading chart...</span>
			</div>
		{/if}

		{#if error}
			<div class="error">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<span>Failed to load chart</span>
				<button on:click={refresh}>Try again</button>
			</div>
		{/if}

		{#key actualUrl}
			<iframe
				bind:this={iframeElement}
				src={actualUrl}
				{title}
				on:load={handleLoad}
				on:error={handleError}
				class:hidden={loading || error}
				sandbox="allow-scripts allow-same-origin"
			></iframe>
		{/key}
	</div>
</div>

<style>
	.chart-embed {
		display: flex;
		flex-direction: column;
		background: #1a1a2e;
		border: 1px solid #2d2d44;
		border-radius: 8px;
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.chart-embed.fullscreen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1000;
		border-radius: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: #252540;
		border-bottom: 1px solid #2d2d44;
	}

	.title {
		font-size: 0.875rem;
		font-weight: 500;
		color: #9ca3af;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.separator {
		width: 1px;
		height: 20px;
		background: #3d3d54;
		margin: 0 0.5rem;
	}

	.renderer-toggle {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: #2d2d44;
		border: 1px solid #3d3d54;
		border-radius: 4px;
		color: #9ca3af;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.renderer-toggle:hover {
		background: #3d3d54;
		color: #e5e7eb;
	}

	.renderer-toggle.react {
		background: rgba(99, 102, 241, 0.2);
		border-color: #6366f1;
		color: #a5b4fc;
	}

	.renderer-toggle.react:hover {
		background: rgba(99, 102, 241, 0.3);
		color: #c7d2fe;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: #2d2d44;
		color: #9ca3af;
	}

	.iframe-container {
		flex: 1;
		position: relative;
		background: white;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: none;
	}

	iframe.hidden {
		opacity: 0;
	}

	.loading,
	.error {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: #1a1a2e;
		color: #9ca3af;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid #2d2d44;
		border-top-color: #6366f1;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error {
		color: #f87171;
	}

	.error button {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background: #2d2d44;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
	}

	.error button:hover {
		background: #3d3d54;
	}
</style>
