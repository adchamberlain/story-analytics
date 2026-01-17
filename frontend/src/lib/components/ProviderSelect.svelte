<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '../stores/auth';
	import { getProviders, updatePreferences } from '../api';
	import type { Provider } from '../types';

	let providers: Provider[] = [];
	let selectedProvider: string = '';
	let loading = false;
	let error = '';

	onMount(async () => {
		try {
			const response = await getProviders();
			providers = response.providers;
			if ($user) {
				selectedProvider = $user.preferred_provider;
			}
		} catch (e) {
			console.error('Failed to load providers:', e);
		}
	});

	$: if ($user) {
		selectedProvider = $user.preferred_provider;
	}

	async function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newProvider = target.value;

		// Compare against the user's stored preference, not the local state
		// (bind:value updates selectedProvider before this handler runs)
		if ($user && newProvider === $user.preferred_provider) return;

		loading = true;
		error = '';

		try {
			const updatedUser = await updatePreferences({ preferred_provider: newProvider });
			user.set(updatedUser);
			// selectedProvider will be updated by the reactive statement
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update preference';
			// Revert selection
			if ($user) {
				selectedProvider = $user.preferred_provider;
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-2">
	<label for="provider" class="block text-terminal-dim text-sm">LLM Provider</label>
	<select
		id="provider"
		value={selectedProvider}
		on:change={handleChange}
		disabled={loading}
		class="w-full bg-terminal-surface border border-terminal-border text-terminal-text
               px-3 py-2 rounded font-mono text-sm focus:border-terminal-accent focus:outline-none
               disabled:opacity-50"
	>
		{#each providers as provider}
			<option value={provider.id}>{provider.name}</option>
		{/each}
	</select>

	{#if error}
		<p class="text-terminal-red text-sm">{error}</p>
	{/if}

	{#if selectedProvider}
		<p class="text-terminal-dim text-xs">
			Using: {providers.find((p) => p.id === selectedProvider)?.models[0] || selectedProvider}
		</p>
	{/if}
</div>
