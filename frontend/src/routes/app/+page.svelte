<script lang="ts">
	import { page } from '$app/stores';
	import Chat from '$lib/components/Chat.svelte';

	$: editSlug = $page.url.searchParams.get('edit');
</script>

<div class="h-full">
	<Chat {editSlug} />
</div>
