<script lang="ts">
	import { marked } from 'marked';
	import type { Message } from '../types';

	export let message: Message;

	// Configure marked for terminal-friendly output with links opening in new tabs
	const renderer = new marked.Renderer();
	renderer.link = (href, title, text) => {
		const titleAttr = title ? ` title="${title}"` : '';
		return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
	};

	marked.setOptions({
		breaks: true,
		gfm: true,
		renderer
	});

	$: renderedContent = message.role === 'assistant' ? marked(message.content) : message.content;
</script>

<div class="py-3 {message.role === 'user' ? 'border-l-2 border-terminal-accent pl-4' : 'pl-4'}">
	<div class="flex items-start gap-3">
		{#if message.role === 'user'}
			<span class="text-terminal-accent font-bold shrink-0">{'>'}</span>
		{:else}
			<span class="text-terminal-amber font-bold shrink-0">$</span>
		{/if}

		<div class="flex-1 overflow-hidden">
			{#if message.role === 'user'}
				<p class="text-terminal-text whitespace-pre-wrap">{message.content}</p>
			{:else}
				<div class="markdown-content text-terminal-text prose prose-invert max-w-none">
					{@html renderedContent}
				</div>
			{/if}
		</div>
	</div>
</div>
