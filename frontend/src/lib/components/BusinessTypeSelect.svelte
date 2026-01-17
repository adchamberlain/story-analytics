<script lang="ts">
	import { user } from '../stores/auth';
	import { updatePreferences } from '../api';
	import { loadTemplates } from '../stores/templates';
	import type { BusinessType } from '../types';

	const businessTypes: { id: BusinessType; name: string; description: string }[] = [
		{ id: 'saas', name: 'SaaS / Subscriptions', description: 'Subscription-based businesses' },
		{ id: 'ecommerce', name: 'E-commerce / Retail', description: 'Online and retail businesses' },
		{ id: 'general', name: 'General Business', description: 'Universal business analytics' }
	];

	let selectedType: BusinessType = 'general';
	let loading = false;
	let error = '';

	$: if ($user) {
		selectedType = $user.business_type;
	}

	async function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newType = target.value as BusinessType;

		if ($user && newType === $user.business_type) return;

		loading = true;
		error = '';

		try {
			const updatedUser = await updatePreferences({ business_type: newType });
			user.set(updatedUser);
			// Refresh templates when business type changes
			await loadTemplates();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update preference';
			if ($user) {
				selectedType = $user.business_type;
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-2">
	<label for="business-type" class="block text-terminal-dim text-sm">Business Type</label>
	<select
		id="business-type"
		value={selectedType}
		on:change={handleChange}
		disabled={loading}
		class="w-full bg-terminal-surface border border-terminal-border text-terminal-text
               px-3 py-2 rounded font-mono text-sm focus:border-terminal-accent focus:outline-none
               disabled:opacity-50"
	>
		{#each businessTypes as type}
			<option value={type.id}>{type.name}</option>
		{/each}
	</select>

	{#if error}
		<p class="text-terminal-red text-sm">{error}</p>
	{/if}

	{#if selectedType}
		<p class="text-terminal-dim text-xs">
			{businessTypes.find((t) => t.id === selectedType)?.description || ''}
		</p>
	{/if}
</div>
