<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { verifyMagicLink } from '$lib/api';
	import { setUser } from '$lib/stores/auth';

	let status: 'verifying' | 'success' | 'error' = 'verifying';
	let error = '';

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			status = 'error';
			error = 'No verification token provided';
			return;
		}

		try {
			const response = await verifyMagicLink(token);
			setUser(response.user);
			status = 'success';

			// Redirect to app after a brief moment
			setTimeout(() => {
				goto('/app');
			}, 1500);
		} catch (e) {
			status = 'error';
			error = e instanceof Error ? e.message : 'Verification failed';
		}
	});
</script>

<div class="min-h-screen bg-terminal-bg flex items-center justify-center p-4">
	<div class="terminal-window w-full max-w-md">
		<div class="terminal-header">
			<div class="terminal-dot terminal-dot-red"></div>
			<div class="terminal-dot terminal-dot-yellow"></div>
			<div class="terminal-dot terminal-dot-green"></div>
			<span class="text-terminal-dim text-sm ml-2">verify</span>
		</div>

		<div class="p-6 text-center">
			{#if status === 'verifying'}
				<div class="py-8">
					<div class="loading-spinner mx-auto mb-4"></div>
					<p class="text-terminal-text">Verifying your link...</p>
				</div>
			{:else if status === 'success'}
				<div class="py-8">
					<div class="text-terminal-green text-4xl mb-4">✓</div>
					<p class="text-terminal-green font-bold mb-2">You're in!</p>
					<p class="text-terminal-dim text-sm">Redirecting to dashboard...</p>
				</div>
			{:else}
				<div class="py-8">
					<div class="text-terminal-red text-4xl mb-4">✗</div>
					<p class="text-terminal-red font-bold mb-2">Verification failed</p>
					<p class="text-terminal-dim text-sm mb-6">{error}</p>
					<a href="/login" class="btn-terminal btn-terminal-primary inline-block">
						Try again
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--terminal-border, #222);
		border-top-color: var(--terminal-green, #22c55e);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
