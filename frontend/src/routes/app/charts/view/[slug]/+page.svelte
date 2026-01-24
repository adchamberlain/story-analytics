<script lang="ts">
	/**
	 * Chart View Page - View/edit a chart by its Evidence URL slug.
	 *
	 * This page is accessed from the "View Source" link on Evidence pages.
	 * It loads the chart by slug and displays it with editing capabilities.
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getChartBySlug, type ChartBySlugResponse, type Chart } from '$lib/api';
	import ChartEmbed from '$lib/components/ChartEmbed.svelte';

	let slug: string;
	let loading = true;
	let error: string | null = null;
	let pageData: ChartBySlugResponse | null = null;

	$: slug = $page.params.slug;

	onMount(async () => {
		await loadChart();
	});

	async function loadChart() {
		loading = true;
		error = null;
		try {
			pageData = await getChartBySlug(slug);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load chart';
		} finally {
			loading = false;
		}
	}

	function handleBack() {
		goto('/app/charts');
	}

	function handleOpenEvidence() {
		window.open(`http://localhost:3000/${slug}`, '_blank');
	}

	function formatSQL(sql: string): string {
		if (!sql) return '';
		const lineBreakKeywords = [
			'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN',
			'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
			'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT'
		];
		let formatted = sql.trim();
		for (const keyword of lineBreakKeywords) {
			const regex = new RegExp(`\\s+(${keyword})\\s+`, 'gi');
			formatted = formatted.replace(regex, `\n${keyword} `);
		}
		return formatted;
	}
</script>

<svelte:head>
	<title>{pageData?.chart?.title || 'Chart'} | Story</title>
</svelte:head>

<div class="chart-view-page">
	<!-- Header -->
	<div class="page-header">
		<div class="header-left">
			<button class="back-btn" on:click={handleBack}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5" />
					<path d="M12 19l-7-7 7-7" />
				</svg>
				Back to Charts
			</button>
		</div>
		{#if pageData?.chart}
			<h1>{pageData.chart.title}</h1>
		{/if}
		<div class="header-right">
			<button class="btn-secondary" on:click={handleOpenEvidence}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					<polyline points="15 3 21 3 21 9" />
					<line x1="10" y1="14" x2="21" y2="3" />
				</svg>
				Open in Evidence
			</button>
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		{#if loading}
			<div class="loading">
				<div class="spinner"></div>
				<span>Loading chart...</span>
			</div>
		{:else if error}
			<div class="error-state">
				<h2>Error</h2>
				<p>{error}</p>
				<button class="btn-primary" on:click={handleBack}>
					Go to Charts
				</button>
			</div>
		{:else if pageData?.type === 'chart' && pageData.chart}
			<div class="chart-details">
				<!-- Preview -->
				<div class="preview-section">
					<h2>Preview</h2>
					<div class="preview-container">
						<ChartEmbed
							url={`http://localhost:3000/${slug}?embed=true`}
							title={pageData.chart.title}
							height="400px"
							chartId={pageData.chart.id}
						/>
					</div>
				</div>

				<!-- Details -->
				<div class="details-section">
					<div class="detail-card">
						<h3>Description</h3>
						<p>{pageData.chart.description || 'No description'}</p>
					</div>

					<div class="detail-card">
						<h3>Chart Type</h3>
						<span class="chart-type-badge">{pageData.chart.chart_type}</span>
					</div>

					<div class="detail-card">
						<h3>SQL Query</h3>
						<pre class="sql-code">{formatSQL(pageData.chart.sql)}</pre>
					</div>

					<div class="detail-card">
						<h3>Original Request</h3>
						<p class="original-request">{pageData.chart.original_request}</p>
					</div>

					<div class="detail-card">
						<h3>Created</h3>
						<p>{new Date(pageData.chart.created_at).toLocaleString()}</p>
					</div>
				</div>
			</div>
		{:else if pageData?.type === 'dashboard'}
			<div class="dashboard-info">
				<h2>This is a multi-chart dashboard</h2>
				<p>Title: {pageData.dashboard_title}</p>
				<p>Charts: {pageData.charts?.length || 0}</p>
				<div class="charts-list">
					{#each pageData.charts || [] as chart}
						<div class="chart-item">
							<span class="chart-type">{chart.chart_type}</span>
							<span class="chart-title">{chart.title}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.chart-view-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0a0a0a;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #2d2d44;
		background: #1e1e32;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.page-header h1 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #e5e7eb;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #9ca3af;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-btn:hover {
		background: #2d2d44;
		color: #e5e7eb;
	}

	.header-right {
		display: flex;
		gap: 0.75rem;
	}

	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #2d2d44;
		border: 1px solid #3d3d54;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-secondary:hover {
		background: #3d3d54;
	}

	.btn-primary {
		padding: 0.5rem 1rem;
		background: #6366f1;
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-primary:hover {
		background: #5558e3;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		color: #9ca3af;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #2d2d44;
		border-top-color: #6366f1;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		text-align: center;
	}

	.error-state h2 {
		margin: 0;
		color: #f87171;
		font-size: 1.25rem;
	}

	.error-state p {
		margin: 0;
		color: #9ca3af;
	}

	.chart-details {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.preview-section h2,
	.details-section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.preview-container {
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 8px;
		overflow: hidden;
	}

	.details-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1rem;
	}

	.detail-card {
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 8px;
		padding: 1rem;
	}

	.detail-card p {
		margin: 0;
		color: #e5e7eb;
		line-height: 1.5;
	}

	.chart-type-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: #6366f1;
		border-radius: 4px;
		color: white;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.sql-code {
		margin: 0;
		padding: 0.75rem;
		background: #0a0a0a;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		color: #9ca3af;
		white-space: pre-wrap;
		overflow-x: auto;
	}

	.original-request {
		font-style: italic;
		color: #9ca3af !important;
	}

	.dashboard-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		text-align: center;
	}

	.dashboard-info h2 {
		margin: 0;
		color: #e5e7eb;
	}

	.dashboard-info p {
		margin: 0;
		color: #9ca3af;
	}

	.charts-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.chart-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
	}

	.chart-item .chart-type {
		padding: 0.125rem 0.375rem;
		background: #2d2d44;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.chart-item .chart-title {
		color: #e5e7eb;
	}
</style>
