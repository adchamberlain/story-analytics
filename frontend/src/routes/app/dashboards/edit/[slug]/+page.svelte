<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getDashboardContent, updateDashboardContent, type DashboardContent } from '$lib/api';

	let slug: string;
	let dashboard: DashboardContent | null = null;
	let loading = true;
	let saving = false;
	let error: string | null = null;
	let editorContent = '';
	let hasChanges = false;
	let previewKey = 0;

	// Monaco editor instance
	let editorContainer: HTMLDivElement;
	let editor: any;
	let monaco: any;

	$: slug = $page.params.slug;

	onMount(async () => {
		await loadDashboard();
		await initMonaco();
	});

	onDestroy(() => {
		if (editor) {
			editor.dispose();
		}
	});

	async function loadDashboard() {
		loading = true;
		error = null;
		try {
			dashboard = await getDashboardContent(slug);
			editorContent = dashboard.content;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load dashboard';
		} finally {
			loading = false;
		}
	}

	async function initMonaco() {
		// Dynamic import for Monaco
		const monacoLoader = await import('@monaco-editor/loader');
		monaco = await monacoLoader.default.init();

		editor = monaco.editor.create(editorContainer, {
			value: editorContent,
			language: 'markdown',
			theme: 'vs-dark',
			fontSize: 14,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			minimap: { enabled: false },
			wordWrap: 'on',
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			automaticLayout: true,
			padding: { top: 16, bottom: 16 }
		});

		// Listen for changes
		editor.onDidChangeModelContent(() => {
			editorContent = editor.getValue();
			hasChanges = editorContent !== dashboard?.content;
		});
	}

	async function handleSave() {
		if (!dashboard || saving) return;

		saving = true;
		error = null;

		try {
			dashboard = await updateDashboardContent(slug, editorContent);
			hasChanges = false;
			// Refresh preview
			previewKey++;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	function handleRefreshPreview() {
		previewKey++;
	}

	function handleBack() {
		if (hasChanges && !confirm('You have unsaved changes. Discard them?')) {
			return;
		}
		goto('/app/dashboards');
	}

	// Keyboard shortcut for save
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="h-full flex flex-col bg-terminal-bg">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface">
		<div class="flex items-center gap-4">
			<button
				on:click={handleBack}
				class="text-terminal-dim hover:text-terminal-text transition-colors"
			>
				&larr; Back
			</button>
			<div>
				<h1 class="text-terminal-accent font-bold">
					{dashboard?.title || 'Loading...'}
				</h1>
				<p class="text-terminal-dim text-xs">/{slug}</p>
			</div>
		</div>

		<div class="flex items-center gap-3">
			{#if hasChanges}
				<span class="text-terminal-amber text-sm">Unsaved changes</span>
			{/if}
			<button
				on:click={handleRefreshPreview}
				class="btn-terminal btn-terminal-secondary text-sm"
				title="Refresh preview"
			>
				Refresh Preview
			</button>
			<button
				on:click={handleSave}
				disabled={saving || !hasChanges}
				class="btn-terminal btn-terminal-primary text-sm disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>

	{#if error}
		<div class="px-4 py-2 bg-terminal-red/20 text-terminal-red text-sm">
			{error}
		</div>
	{/if}

	<!-- Split pane -->
	{#if loading}
		<div class="flex-1 flex items-center justify-center text-terminal-dim">
			Loading dashboard...
		</div>
	{:else if dashboard}
		<div class="flex-1 flex overflow-hidden">
			<!-- Editor pane -->
			<div class="w-1/2 flex flex-col border-r border-terminal-border">
				<div class="px-4 py-2 border-b border-terminal-border bg-terminal-surface text-terminal-dim text-xs uppercase tracking-wide">
					Editor
				</div>
				<div class="flex-1 overflow-hidden" bind:this={editorContainer}></div>
			</div>

			<!-- Preview pane -->
			<div class="w-1/2 flex flex-col">
				<div class="px-4 py-2 border-b border-terminal-border bg-terminal-surface text-terminal-dim text-xs uppercase tracking-wide flex items-center justify-between">
					<span>Preview</span>
					<a
						href={dashboard.url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-terminal-accent hover:underline"
					>
						Open in new tab &rarr;
					</a>
				</div>
				<div class="flex-1 bg-white">
					{#key previewKey}
						<iframe
							src={dashboard.url}
							title="Dashboard preview"
							class="w-full h-full border-0"
						></iframe>
					{/key}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Ensure Monaco editor fills container */
	:global(.monaco-editor) {
		position: absolute !important;
	}
</style>
