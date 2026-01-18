<script lang="ts">
	import { onMount } from 'svelte';
	import { user, updateUserPreference } from '$lib/stores/auth';
	import { getSources, type SourceInfo } from '$lib/api';

	let sources: SourceInfo[] = [];
	let loading = true;
	let error: string | null = null;
	let selectedSource = $user?.preferred_source || 'snowflake_saas';

	onMount(async () => {
		try {
			sources = await getSources();
		} catch (e) {
			error = 'Failed to load data sources';
			console.error(e);
		} finally {
			loading = false;
		}
	});

	// Update when user changes
	$: if ($user) {
		selectedSource = $user.preferred_source;
	}

	async function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newSource = target.value;

		try {
			await updateUserPreference('preferred_source', newSource);
			selectedSource = newSource;
		} catch (e) {
			console.error('Failed to update source preference:', e);
			// Revert selection on error
			selectedSource = $user?.preferred_source || 'snowflake_saas';
		}
	}

	function getSourceDisplayName(source: SourceInfo): string {
		if (source.database && source.schema_name) {
			return `${source.name} (${source.database}.${source.schema_name})`;
		}
		return source.name;
	}
</script>

<div class="space-y-2">
	{#if loading}
		<p class="text-terminal-dim text-sm">Loading sources...</p>
	{:else if error}
		<p class="text-red-400 text-sm">{error}</p>
	{:else if sources.length === 0}
		<p class="text-terminal-dim text-sm">No data sources configured</p>
	{:else}
		<select
			value={selectedSource}
			on:change={handleChange}
			class="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-terminal-text
				focus:outline-none focus:border-terminal-accent transition-colors"
		>
			{#each sources as source}
				<option
					value={source.name}
					disabled={!source.connected}
					class="bg-terminal-bg"
				>
					{getSourceDisplayName(source)}
					{#if !source.connected}
						(not configured)
					{/if}
				</option>
			{/each}
		</select>

		<!-- Source Details -->
		{#if selectedSource}
			{@const currentSource = sources.find(s => s.name === selectedSource)}
			{#if currentSource}
				<div class="mt-3 p-3 bg-terminal-surface rounded border border-terminal-border">
					<div class="grid grid-cols-2 gap-2 text-xs">
						<span class="text-terminal-dim">Type:</span>
						<span class="text-terminal-text capitalize">{currentSource.type}</span>

						{#if currentSource.database}
							<span class="text-terminal-dim">Database:</span>
							<span class="text-terminal-text">{currentSource.database}</span>
						{/if}

						{#if currentSource.schema_name}
							<span class="text-terminal-dim">Schema:</span>
							<span class="text-terminal-text">{currentSource.schema_name}</span>
						{/if}

						<span class="text-terminal-dim">Status:</span>
						<span class={currentSource.connected ? 'text-terminal-accent' : 'text-terminal-amber'}>
							{currentSource.connected ? 'Connected' : 'Not configured'}
						</span>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
