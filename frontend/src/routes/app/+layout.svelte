<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isAuthenticated } from '$lib/api';
	import { initAuth, authLoading, user } from '$lib/stores/auth';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChartNotification from '$lib/components/ChartNotification.svelte';

	onMount(async () => {
		await initAuth();
		if (!isAuthenticated()) {
			goto('/login');
		}
	});

	$: currentPath = $page.url.pathname;
</script>

{#if $authLoading}
	<div class="min-h-screen bg-terminal-bg flex items-center justify-center">
		<div class="text-terminal-dim">Loading...</div>
	</div>
{:else if $user}
	<div class="min-h-screen bg-terminal-bg flex">
		<Sidebar {currentPath} />
		<main class="flex-1 h-screen overflow-hidden">
			<slot />
		</main>
	</div>
	<!-- Global notification for background chart completion -->
	<ChartNotification />
{/if}
