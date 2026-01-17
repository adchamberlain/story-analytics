<script lang="ts">
	import { onMount } from 'svelte';
	import { dashboards, dashboardsLoading, loadDashboards, deleteDashboard } from '../stores/dashboards';

	let deleteConfirm: string | null = null;

	onMount(() => {
		loadDashboards();
	});

	async function handleDelete(slug: string) {
		if (deleteConfirm !== slug) {
			deleteConfirm = slug;
			return;
		}

		try {
			await deleteDashboard(slug);
			deleteConfirm = null;
		} catch (e) {
			alert('Failed to delete dashboard');
		}
	}

	function cancelDelete() {
		deleteConfirm = null;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h2 class="text-terminal-accent font-bold text-lg">Dashboards</h2>
	</div>

	<!-- List -->
	{#if $dashboardsLoading}
		<div class="text-terminal-dim text-center py-8">Loading dashboards...</div>
	{:else if $dashboards.length === 0}
		<div class="text-terminal-dim text-center py-8">
			<p>No dashboards yet.</p>
			<p class="text-sm mt-2">Start a conversation to create your first dashboard.</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each $dashboards as dashboard}
				<div
					class="p-4 bg-terminal-surface border border-terminal-border rounded hover:border-terminal-dim transition-colors"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1 min-w-0">
							<a
								href={dashboard.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-terminal-accent hover:underline font-medium truncate block"
							>
								{dashboard.title}
							</a>
							<p class="text-terminal-dim text-sm mt-1">/{dashboard.slug}</p>
							<p class="text-terminal-dim text-xs mt-1">
								Updated {formatDate(dashboard.updated_at)}
							</p>
						</div>

						<div class="flex items-center gap-3 shrink-0">
							<a
								href={dashboard.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-terminal-dim hover:text-terminal-text text-sm"
							>
								Open
							</a>
							<span class="text-terminal-border">|</span>
							<a
								href="/app?edit={dashboard.slug}"
								class="text-terminal-accent hover:text-terminal-accent-bright text-sm font-medium"
							>
								Edit with AI
							</a>
							<a
								href="/app/dashboards/edit/{dashboard.slug}"
								class="text-terminal-dim hover:text-terminal-text text-sm"
								title="Edit markdown directly"
							>
								Edit manually
							</a>
							<span class="text-terminal-border">|</span>

							{#if deleteConfirm === dashboard.slug}
								<button
									on:click={() => handleDelete(dashboard.slug)}
									class="text-terminal-red text-sm"
								>
									Confirm
								</button>
								<button on:click={cancelDelete} class="text-terminal-dim text-sm"> Cancel </button>
							{:else}
								<button
									on:click={() => handleDelete(dashboard.slug)}
									class="text-terminal-dim hover:text-terminal-red text-sm"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
