<script>
	import '@evidence-dev/tailwind/fonts.css';
	import '../app.css';
	import { EvidenceDefaultLayout } from '@evidence-dev/core-components';
	import { page } from '$app/stores';
	export let data;

	// Extract slug from current path (e.g., "/my-dashboard" -> "my-dashboard")
	$: slug = $page.url.pathname.split('/').filter(Boolean)[0] || '';
	$: editorUrl = slug ? `http://localhost:5173/app/dashboards/edit/${slug}` : '';
	$: isHomePage = $page.url.pathname === '/' || $page.url.pathname === '';
</script>

<!-- Override Evidence's default title -->
<svelte:head>
	<title>Story</title>
</svelte:head>

<EvidenceDefaultLayout
	{data}
	title="STORY"
	builtWithEvidence={false}
	neverShowQueries={true}
>
	<slot slot="content" />
</EvidenceDefaultLayout>

{#if !isHomePage && editorUrl}
	<div class="view-source-link">
		<a href={editorUrl} target="_blank" rel="noopener noreferrer">
			View Source
		</a>
	</div>
{/if}

<style>
	/* Add blinking cursor after STORY title */
	:global(header a[href="/"]) {
		letter-spacing: 0.15em;
		font-weight: 700;
		color: #7c9eff !important;
	}

	/* Dual cursor design - human + AI collaboration */
	:global(header a[href="/"]::after) {
		content: '';
		display: inline-block;
		width: 0.5em;
		height: 1.1em;
		background-color: #7c9eff;
		margin-left: 0.2em;
		vertical-align: text-bottom;
		animation: blink 1s step-end infinite;
		box-shadow: 0.65em 0 0 #7c9eff;
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	/* Hide Evidence query viewer boxes */
	:global(.over-container),
	:global(.scrollbox) {
		display: none !important;
	}

	/* View Source link styling - positioned in main content area */
	.view-source-link {
		max-width: 768px;
		margin: 2rem auto 1rem;
		padding: 1rem 1rem 0;
		text-align: center;
		/* Offset to align with Evidence's main content column */
		margin-left: calc(200px + 2rem);
		margin-right: calc(200px + 2rem);
	}

	.view-source-link a {
		color: #9ca3af;
		font-size: 0.75rem;
		text-decoration: none;
		transition: color 0.2s;
	}

	.view-source-link a:hover {
		color: #7c9eff;
	}

	@media (max-width: 1024px) {
		.view-source-link {
			margin-left: 1rem;
			margin-right: 1rem;
		}
	}
</style>
