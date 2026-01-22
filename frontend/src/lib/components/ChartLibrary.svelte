<script lang="ts">
	/**
	 * ChartLibrary - Browse and manage saved charts.
	 *
	 * Features:
	 * - Grid view of all charts
	 * - Search and filter
	 * - Chart preview on hover/click
	 * - Select charts for dashboard composition
	 * - Delete charts
	 */

	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import ChartEmbed from './ChartEmbed.svelte';
	import {
		charts,
		chartsLoading,
		chartsError,
		selectedChartIds,
		loadCharts,
		deleteChartFromLibrary,
		toggleChartSelection,
		getChartPreviewUrl
	} from '../stores/chart';
	import type { Chart } from '../types';

	const dispatch = createEventDispatcher();

	export let selectionMode: boolean = false;

	let searchQuery = '';
	let filterType = '';
	let previewChart: Chart | null = null;
	let previewUrl: string | null = null;

	// Chart type options
	const chartTypes = [
		{ value: '', label: 'All Types' },
		{ value: 'LineChart', label: 'Line Chart' },
		{ value: 'BarChart', label: 'Bar Chart' },
		{ value: 'AreaChart', label: 'Area Chart' },
		{ value: 'BigValue', label: 'KPI / Big Value' },
		{ value: 'DataTable', label: 'Data Table' }
	];

	onMount(() => {
		loadCharts();
	});

	async function handleSearch() {
		await loadCharts({
			query: searchQuery || undefined,
			chart_type: filterType || undefined
		});
	}

	async function handleDelete(chart: Chart) {
		if (!confirm(`Delete "${chart.title}"?`)) return;

		try {
			await deleteChartFromLibrary(chart.id);
		} catch (error) {
			alert('Failed to delete chart');
		}
	}

	async function handlePreview(chart: Chart) {
		previewChart = chart;
		try {
			previewUrl = await getChartPreviewUrl(chart.id);
		} catch (error) {
			console.error('Failed to get preview URL:', error);
			previewUrl = null;
		}
	}

	function closePreview() {
		previewChart = null;
		previewUrl = null;
	}

	function handleSelect(chart: Chart) {
		if (selectionMode) {
			toggleChartSelection(chart.id);
		} else {
			handlePreview(chart);
		}
	}

	function getChartTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			LineChart: '📈',
			BarChart: '📊',
			AreaChart: '📉',
			BigValue: '🔢',
			DataTable: '📋',
			ScatterPlot: '⚬',
			Histogram: '▐',
			default: '📊'
		};
		return icons[type] || icons.default;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatSQL(sql: string): string {
		if (!sql) return '';

		// Keywords that should start on a new line
		const lineBreakKeywords = [
			'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN',
			'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
			'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
			'UNION', 'INTERSECT', 'EXCEPT', 'WITH', 'ON'
		];

		let formatted = sql.trim();

		// Add line breaks before keywords (case-insensitive)
		for (const keyword of lineBreakKeywords) {
			// Match keyword with word boundaries, case-insensitive
			const regex = new RegExp(`\\s+(${keyword})\\s+`, 'gi');
			formatted = formatted.replace(regex, `\n${keyword} `);
		}

		// Indent lines after SELECT until FROM
		const lines = formatted.split('\n');
		const result: string[] = [];
		let inSelect = false;

		for (const line of lines) {
			const trimmed = line.trim();
			const upper = trimmed.toUpperCase();

			if (upper.startsWith('SELECT')) {
				inSelect = true;
				result.push(trimmed);
			} else if (upper.startsWith('FROM') || upper.startsWith('WITH')) {
				inSelect = false;
				result.push(trimmed);
			} else if (inSelect && !upper.startsWith('SELECT')) {
				// Indent continuation of SELECT clause
				result.push('  ' + trimmed);
			} else if (upper.startsWith('AND') || upper.startsWith('OR') || upper.startsWith('ON')) {
				// Indent AND/OR/ON clauses
				result.push('  ' + trimmed);
			} else {
				result.push(trimmed);
			}
		}

		return result.join('\n');
	}

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout>;
	function debouncedSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(handleSearch, 300);
	}
</script>

<div class="chart-library">
	<!-- Header with search and filters -->
	<div class="library-header">
		<div class="search-bar">
			<input
				type="text"
				placeholder="Search charts..."
				bind:value={searchQuery}
				on:input={debouncedSearch}
			/>
			<select bind:value={filterType} on:change={handleSearch}>
				{#each chartTypes as type}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>
		</div>

		{#if selectionMode}
			<div class="selection-info">
				<span>{$selectedChartIds.length} selected</span>
				<button
					class="create-dashboard-btn"
					disabled={$selectedChartIds.length === 0}
					on:click={() => dispatch('createDashboard')}
				>
					Create Dashboard
				</button>
			</div>
		{/if}
	</div>

	<!-- Charts grid -->
	<div class="charts-grid">
		{#if $chartsLoading}
			<div class="loading">
				<div class="spinner"></div>
				<span>Loading charts...</span>
			</div>
		{:else if $chartsError}
			<div class="error">
				<span>{$chartsError}</span>
				<button on:click={() => loadCharts()}>Try again</button>
			</div>
		{:else if $charts.length === 0}
			<div class="empty">
				<span class="empty-icon">📊</span>
				<span class="empty-text">No charts yet</span>
				<span class="empty-hint">Create your first chart to see it here</span>
			</div>
		{:else}
			{#each $charts as chart}
				<div
					class="chart-card"
					class:selected={$selectedChartIds.includes(chart.id)}
					on:click={() => handleSelect(chart)}
					on:keydown={(e) => e.key === 'Enter' && handleSelect(chart)}
					role="button"
					tabindex="0"
				>
					{#if selectionMode}
						<div class="selection-checkbox">
							<input
								type="checkbox"
								checked={$selectedChartIds.includes(chart.id)}
								on:click|stopPropagation={() => toggleChartSelection(chart.id)}
							/>
						</div>
					{/if}

					<div class="card-header">
						<span class="chart-type-icon">{getChartTypeIcon(chart.chart_type)}</span>
						<span class="chart-type">{chart.chart_type}</span>
					</div>

					<h3 class="chart-title">{chart.title}</h3>

					<p class="chart-description">
						{chart.description || chart.original_request}
					</p>

					<div class="card-footer">
						<span class="chart-date">{formatDate(chart.created_at)}</span>
						<div class="card-actions">
							<button
								class="icon-btn"
								title="Preview"
								on:click|stopPropagation={() => handlePreview(chart)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							</button>
							<button
								class="icon-btn delete"
								title="Delete"
								on:click|stopPropagation={() => handleDelete(chart)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M3 6h18" />
									<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
									<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
								</svg>
							</button>
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Preview modal -->
	{#if previewChart && previewUrl}
		<div class="preview-modal" on:click={closePreview} on:keydown={(e) => e.key === 'Escape' && closePreview()}>
			<div class="preview-content" on:click|stopPropagation>
				<div class="preview-header">
					<h2>{previewChart.title}</h2>
					<button class="close-btn" on:click={closePreview}>×</button>
				</div>
				<div class="preview-body">
					<ChartEmbed
						url={previewUrl}
						title={previewChart.title}
						height="500px"
					/>
				</div>
				<div class="preview-footer">
					<p class="preview-description">{previewChart.description}</p>
					<code class="preview-sql">{formatSQL(previewChart.sql)}</code>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.chart-library {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0f0f1a;
	}

	.library-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #2d2d44;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.search-bar {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		min-width: 250px;
	}

	.search-bar input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
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

	.selection-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.create-dashboard-btn {
		padding: 0.5rem 1rem;
		background: #6366f1;
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.create-dashboard-btn:hover:not(:disabled) {
		background: #5558e3;
	}

	.create-dashboard-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.charts-grid {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
		align-content: start;
	}

	.chart-card {
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 8px;
		padding: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		position: relative;
	}

	.chart-card:hover {
		border-color: #6366f1;
		transform: translateY(-2px);
	}

	.chart-card.selected {
		border-color: #6366f1;
		background: #252550;
	}

	.selection-checkbox {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
	}

	.selection-checkbox input {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.chart-type-icon {
		font-size: 1.25rem;
	}

	.chart-type {
		font-size: 0.75rem;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.chart-title {
		font-size: 1rem;
		font-weight: 600;
		color: #e5e7eb;
		margin: 0 0 0.5rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chart-description {
		font-size: 0.875rem;
		color: #9ca3af;
		margin: 0 0 0.75rem 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.4;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.chart-date {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.card-actions {
		display: flex;
		gap: 0.25rem;
	}

	.icon-btn {
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

	.icon-btn:hover {
		background: #2d2d44;
		color: #9ca3af;
	}

	.icon-btn.delete:hover {
		background: #3b1c1c;
		color: #f87171;
	}

	/* Loading, error, empty states */
	.loading,
	.error,
	.empty {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		color: #9ca3af;
		gap: 0.75rem;
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
		padding: 0.5rem 1rem;
		background: #2d2d44;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
	}

	.empty-icon {
		font-size: 3rem;
		opacity: 0.5;
	}

	.empty-text {
		font-size: 1.125rem;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: #6b7280;
	}

	/* Preview modal */
	.preview-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
	}

	.preview-content {
		background: #1a1a2e;
		border-radius: 12px;
		width: 100%;
		max-width: 900px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #2d2d44;
	}

	.preview-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: #e5e7eb;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		font-size: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: #2d2d44;
	}

	.preview-body {
		flex: 1;
		overflow: hidden;
	}

	.preview-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid #2d2d44;
		max-height: 200px;
		overflow-y: auto;
	}

	.preview-description {
		margin: 0 0 0.75rem 0;
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.preview-sql {
		display: block;
		background: #0f0f1a;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		color: #6b7280;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
