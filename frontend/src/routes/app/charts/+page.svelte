<script lang="ts">
	/**
	 * Chart Library Page - Browse and manage saved charts.
	 */

	import { goto } from '$app/navigation';
	import ChartLibrary from '$lib/components/ChartLibrary.svelte';
	import { clearChartSelection } from '$lib/stores/chart';

	function handleCreateNew() {
		goto('/app/charts/new');
	}

	function handleCompose() {
		goto('/app/compose');
	}
</script>

<svelte:head>
	<title>Chart Library | Story</title>
</svelte:head>

<div class="charts-page">
	<div class="page-header">
		<div class="header-content">
			<h1>Chart Library</h1>
			<p>All your saved charts in one place</p>
		</div>
		<div class="header-actions">
			<button class="compose-btn" on:click={handleCompose}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="7" height="7" />
					<rect x="14" y="3" width="7" height="7" />
					<rect x="3" y="14" width="7" height="7" />
					<rect x="14" y="14" width="7" height="7" />
				</svg>
				Compose Dashboard
			</button>
			<button class="create-btn" on:click={handleCreateNew}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				New Chart
			</button>
		</div>
	</div>

	<div class="library-container">
		<ChartLibrary />
	</div>
</div>

<style>
	.charts-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0f0f1a;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid #2d2d44;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.header-content h1 {
		margin: 0;
		font-size: 1.5rem;
		color: #e5e7eb;
	}

	.header-content p {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		color: #9ca3af;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
	}

	.compose-btn,
	.create-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.compose-btn {
		background: #2d2d44;
		border: 1px solid #3d3d54;
		color: #e5e7eb;
	}

	.compose-btn:hover {
		background: #3d3d54;
	}

	.create-btn {
		background: #6366f1;
		border: none;
		color: white;
	}

	.create-btn:hover {
		background: #5558e3;
	}

	.library-container {
		flex: 1;
		overflow: hidden;
	}
</style>
