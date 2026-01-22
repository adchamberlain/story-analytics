<script lang="ts">
	import { goto } from '$app/navigation';
	import DashboardList from '$lib/components/DashboardList.svelte';

	let searchQuery = '';

	function handleCreateNew() {
		goto('/app');
	}
</script>

<svelte:head>
	<title>Dashboards | Story</title>
</svelte:head>

<div class="dashboards-page">
	<div class="page-header">
		<div class="header-content">
			<h1>Dashboards</h1>
		</div>
		<div class="header-actions">
			<div class="search-bar">
				<input
					type="text"
					placeholder="Search dashboards..."
					bind:value={searchQuery}
				/>
			</div>
			<button class="create-btn" on:click={handleCreateNew}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				New Dashboard
			</button>
		</div>
	</div>

	<div class="list-container">
		<DashboardList {searchQuery} />
	</div>
</div>

<style>
	.dashboards-page {
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

	.search-bar input {
		padding: 0.5rem 0.75rem;
		background: #1e1e32;
		border: 1px solid #2d2d44;
		border-radius: 6px;
		color: #e5e7eb;
		font-size: 0.875rem;
		width: 250px;
	}

	.search-bar input:focus {
		outline: none;
		border-color: #6366f1;
	}

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
		background: #6366f1;
		border: none;
		color: white;
	}

	.create-btn:hover {
		background: #5558e3;
	}

	.list-container {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem 2rem;
	}
</style>
