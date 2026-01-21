<script lang="ts">
	/**
	 * Dashboard Composer Page - Create dashboards from charts.
	 */

	import { goto } from '$app/navigation';
	import DashboardComposer from '$lib/components/DashboardComposer.svelte';

	function handleDone(event: CustomEvent) {
		goto('/app/dashboards');
	}

	function handleCancel() {
		goto('/app/charts');
	}
</script>

<svelte:head>
	<title>Compose Dashboard | Story</title>
</svelte:head>

<div class="compose-page">
	<DashboardComposer on:done={handleDone} on:cancel={handleCancel} />
</div>

<style>
	.compose-page {
		height: 100%;
		background: #0f0f1a;
	}
</style>
