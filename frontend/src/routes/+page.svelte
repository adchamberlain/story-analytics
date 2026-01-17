<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated } from '$lib/api';

	onMount(() => {
		if (isAuthenticated()) {
			goto('/app');
		} else {
			goto('/login');
		}
	});
</script>

<div class="min-h-screen bg-terminal-bg flex items-center justify-center">
	<div class="text-terminal-dim">Loading...</div>
</div>
