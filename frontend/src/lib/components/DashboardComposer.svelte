<script lang="ts">
	/**
	 * DashboardComposer - Create dashboards by composing charts.
	 *
	 * Features:
	 * - Select charts from library
	 * - Drag and drop to reorder
	 * - Name and describe dashboard
	 * - Preview before publishing
	 */

	import { createEventDispatcher } from 'svelte';
	import ChartLibrary from './ChartLibrary.svelte';
	import ChartEmbed from './ChartEmbed.svelte';
	import {
		charts,
		selectedChartIds,
		clearChartSelection,
		createDashboardFromSelection,
		publishDashboard
	} from '../stores/chart';
	import type { Chart, ComposedDashboard } from '../types';

	const dispatch = createEventDispatcher();

	// Component state
	let step: 'select' | 'configure' | 'preview' = 'select';
	let dashboardTitle = '';
	let dashboardDescription = '';
	let creating = false;
	let createdDashboard: ComposedDashboard | null = null;
	let previewUrl: string | null = null;
	let error: string | null = null;

	// Get selected chart objects
	$: selectedCharts = $charts.filter((c) => $selectedChartIds.includes(c.id));

	function handleCreateDashboard() {
		if ($selectedChartIds.length === 0) {
			error = 'Please select at least one chart';
			return;
		}
		error = null;
		step = 'configure';
	}

	async function handleConfirm() {
		if (!dashboardTitle.trim()) {
			error = 'Please enter a dashboard title';
			return;
		}

		creating = true;
		error = null;

		try {
			const dashboard = await createDashboardFromSelection(
				dashboardTitle.trim(),
				dashboardDescription.trim() || undefined
			);

			if (dashboard) {
				createdDashboard = dashboard;

				// Publish to get the URL
				const result = await publishDashboard(dashboard.id);
				previewUrl = result.embed_url;

				step = 'preview';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create dashboard';
		} finally {
			creating = false;
		}
	}

	function handleBack() {
		if (step === 'configure') {
			step = 'select';
		} else if (step === 'preview') {
			step = 'configure';
		}
	}

	function handleDone() {
		clearChartSelection();
		dashboardTitle = '';
		dashboardDescription = '';
		createdDashboard = null;
		previewUrl = null;
		step = 'select';
		dispatch('done', { dashboard: createdDashboard });
	}

	function handleCancel() {
		clearChartSelection();
		dashboardTitle = '';
		dashboardDescription = '';
		error = null;
		step = 'select';
		dispatch('cancel');
	}

	function removeChart(chartId: string) {
		selectedChartIds.update((ids) => ids.filter((id) => id !== chartId));
	}

	// Drag and drop reordering
	let draggedIndex: number | null = null;

	function handleDragStart(index: number) {
		draggedIndex = index;
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (draggedIndex === null || draggedIndex === index) return;

		// Reorder the selected chart IDs
		selectedChartIds.update((ids) => {
			const newIds = [...ids];
			const [removed] = newIds.splice(draggedIndex!, 1);
			newIds.splice(index, 0, removed);
			return newIds;
		});

		draggedIndex = index;
	}

	function handleDragEnd() {
		draggedIndex = null;
	}
</script>

<div class="dashboard-composer">
	{#if step === 'select'}
		<!-- Step 1: Select charts -->
		<div class="composer-header">
			<h1>Create Dashboard</h1>
			<p>Select charts from your library to include in the dashboard</p>
		</div>

		<ChartLibrary selectionMode={true} on:createDashboard={handleCreateDashboard} />
	{:else if step === 'configure'}
		<!-- Step 2: Configure dashboard -->
		<div class="configure-step">
			<div class="composer-header">
				<button class="back-btn" on:click={handleBack}>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M19 12H5" />
						<path d="M12 19l-7-7 7-7" />
					</svg>
					Back
				</button>
				<h1>Configure Dashboard</h1>
			</div>

			<div class="configure-content">
				<div class="form-section">
					<label for="title">Dashboard Title</label>
					<input
						id="title"
						type="text"
						placeholder="My Dashboard"
						bind:value={dashboardTitle}
					/>
				</div>

				<div class="form-section">
					<label for="description">Description (optional)</label>
					<textarea
						id="description"
						placeholder="What does this dashboard show?"
						bind:value={dashboardDescription}
						rows="3"
					></textarea>
				</div>

				<div class="charts-section">
					<h3>Charts ({selectedCharts.length})</h3>
					<p class="hint">Drag to reorder</p>

					<div class="chart-list">
						{#each selectedCharts as chart, index (chart.id)}
							<div
								class="chart-item"
								draggable="true"
								on:dragstart={() => handleDragStart(index)}
								on:dragover={(e) => handleDragOver(e, index)}
								on:dragend={handleDragEnd}
								class:dragging={draggedIndex === index}
							>
								<span class="drag-handle">⠿</span>
								<span class="chart-name">{chart.title}</span>
								<span class="chart-type">{chart.chart_type}</span>
								<button
									class="remove-btn"
									on:click={() => removeChart(chart.id)}
									title="Remove"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<div class="actions">
					<button class="cancel-btn" on:click={handleCancel}>Cancel</button>
					<button
						class="confirm-btn"
						on:click={handleConfirm}
						disabled={creating || !dashboardTitle.trim()}
					>
						{creating ? 'Creating...' : 'Create Dashboard'}
					</button>
				</div>
			</div>
		</div>
	{:else if step === 'preview'}
		<!-- Step 3: Preview -->
		<div class="preview-step">
			<div class="composer-header">
				<h1>Dashboard Created!</h1>
				<p>{createdDashboard?.title}</p>
			</div>

			{#if previewUrl}
				<div class="preview-container">
					<ChartEmbed
						url={previewUrl}
						title={createdDashboard?.title || 'Dashboard'}
						height="500px"
					/>
				</div>
			{/if}

			<div class="preview-info">
				<p>
					<strong>Slug:</strong> {createdDashboard?.slug}
				</p>
				<p>
					<strong>Charts:</strong> {createdDashboard?.chart_ids.length}
				</p>
			</div>

			<div class="actions">
				<button class="secondary-btn" on:click={handleBack}>Edit</button>
				<button class="confirm-btn" on:click={handleDone}>Done</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.dashboard-composer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0f0f1a;
	}

	.composer-header {
		padding: 1.5rem;
		border-bottom: 1px solid #2d2d44;
	}

	.composer-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
		color: #e5e7eb;
	}

	.composer-header p {
		margin: 0;
		color: #9ca3af;
		font-size: 0.875rem;
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
		padding: 0;
		margin-bottom: 1rem;
	}

	.back-btn:hover {
		color: #e5e7eb;
	}

	/* Configure step */
	.configure-step {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.configure-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.form-section {
		margin-bottom: 1.5rem;
	}

	.form-section label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #e5e7eb;
	}

	.form-section input,
	.form-section textarea {
		width: 100%;
		padding: 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
		font-family: inherit;
	}

	.form-section input:focus,
	.form-section textarea:focus {
		outline: none;
		border-color: #6366f1;
	}

	.form-section textarea {
		resize: vertical;
		min-height: 80px;
	}

	.charts-section {
		margin-bottom: 1.5rem;
	}

	.charts-section h3 {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: #e5e7eb;
	}

	.hint {
		margin: 0 0 0.75rem 0;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.chart-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.chart-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		cursor: grab;
		transition: all 0.2s;
	}

	.chart-item:hover {
		border-color: #6366f1;
	}

	.chart-item.dragging {
		opacity: 0.5;
	}

	.drag-handle {
		color: #6b7280;
		cursor: grab;
	}

	.chart-name {
		flex: 1;
		font-size: 0.875rem;
		color: #e5e7eb;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chart-type {
		font-size: 0.75rem;
		color: #9ca3af;
		background: #2d2d44;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.remove-btn {
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.remove-btn:hover {
		color: #f87171;
	}

	.error-message {
		padding: 0.75rem;
		background: #3b1c1c;
		border: 1px solid #7f1d1d;
		border-radius: 6px;
		color: #f87171;
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid #2d2d44;
	}

	.cancel-btn,
	.secondary-btn {
		padding: 0.75rem 1.5rem;
		background: #2d2d44;
		border: none;
		border-radius: 6px;
		color: #9ca3af;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cancel-btn:hover,
	.secondary-btn:hover {
		background: #3d3d54;
		color: #e5e7eb;
	}

	.confirm-btn {
		padding: 0.75rem 1.5rem;
		background: #6366f1;
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.confirm-btn:hover:not(:disabled) {
		background: #5558e3;
	}

	.confirm-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Preview step */
	.preview-step {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.preview-container {
		flex: 1;
		padding: 1.5rem;
		overflow: hidden;
	}

	.preview-info {
		padding: 0 1.5rem 1rem;
	}

	.preview-info p {
		margin: 0.25rem 0;
		font-size: 0.875rem;
		color: #9ca3af;
	}

	.preview-info strong {
		color: #e5e7eb;
	}

	.preview-step .actions {
		padding: 1rem 1.5rem;
		margin-top: 0;
	}
</style>
