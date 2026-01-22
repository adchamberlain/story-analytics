<script lang="ts">
	/**
	 * Chart Library Page - Browse and manage saved charts.
	 */

	import { goto } from '$app/navigation';
	import ChartLibrary from '$lib/components/ChartLibrary.svelte';
	import { clearChartSelection, resetChartConversation } from '$lib/stores/chart';

	let searchQuery = '';
	let filterType = '';

	const chartTypes = [
		{ value: '', label: 'All Types' },
		{ value: 'LineChart', label: 'Line' },
		{ value: 'BarChart', label: 'Bar' },
		{ value: 'AreaChart', label: 'Area' },
		{ value: 'BigValue', label: 'KPI' },
		{ value: 'DataTable', label: 'Table' }
	];

	function handleCreateNew() {
		// Reset any existing chart conversation before navigating
		resetChartConversation();
		goto('/app/charts/new');
	}

	function handleCompose() {
		goto('/app/compose');
	}
</script>

<svelte:head>
	<title>Charts | Story</title>
</svelte:head>

<div class="charts-page">
	<div class="page-header">
		<div class="header-content">
			<h1>Charts</h1>
		</div>
		<div class="header-actions">
			<div class="search-bar">
				<input
					type="text"
					placeholder="Search charts..."
					bind:value={searchQuery}
				/>
				<select bind:value={filterType}>
					{#each chartTypes as type}
						<option value={type.value}>{type.label}</option>
					{/each}
				</select>
			</div>
			<button class="compose-btn" on:click={handleCompose}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="7" height="7" />
					<rect x="14" y="3" width="7" height="7" />
					<rect x="3" y="14" width="7" height="7" />
					<rect x="14" y="14" width="7" height="7" />
				</svg>
				Build Dashboard
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
		<ChartLibrary {searchQuery} {filterType} />
	</div>
</div>

<style>
	.charts-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0a0a0a;
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
		font-size: 1.125rem;
		font-weight: bold;
		color: #7c9eff;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.search-bar {
		display: flex;
		gap: 0.5rem;
	}

	.search-bar input {
		padding: 0.5rem 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
		width: 200px;
	}

	.search-bar input:focus {
		outline: none;
		border-color: #6366f1;
	}

	.search-bar select {
		padding: 0.5rem 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.search-bar select:focus {
		outline: none;
		border-color: #6366f1;
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
