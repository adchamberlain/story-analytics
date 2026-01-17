<script lang="ts">
	import { user } from '$lib/stores/auth';
	import ProviderSelect from '$lib/components/ProviderSelect.svelte';
	import BusinessTypeSelect from '$lib/components/BusinessTypeSelect.svelte';
</script>

<div class="h-full overflow-y-auto p-6">
	<h2 class="text-terminal-accent font-bold text-lg mb-6">Settings</h2>

	<div class="max-w-md space-y-8">
		<!-- Account Info -->
		<section class="terminal-window p-4">
			<h2 class="text-terminal-amber font-bold mb-4">Account</h2>
			{#if $user}
				<div class="space-y-2 text-sm">
					<div class="flex">
						<span class="text-terminal-dim w-24">Name:</span>
						<span class="text-terminal-text">{$user.name}</span>
					</div>
					<div class="flex">
						<span class="text-terminal-dim w-24">Email:</span>
						<span class="text-terminal-text">{$user.email}</span>
					</div>
					<div class="flex">
						<span class="text-terminal-dim w-24">Joined:</span>
						<span class="text-terminal-text">
							{new Date($user.created_at).toLocaleDateString()}
						</span>
					</div>
				</div>
			{/if}
		</section>

		<!-- LLM Provider -->
		<section class="terminal-window p-4">
			<h2 class="text-terminal-amber font-bold mb-4">AI Provider</h2>
			<ProviderSelect />
		</section>

		<!-- Business Type -->
		<section class="terminal-window p-4">
			<h2 class="text-terminal-amber font-bold mb-4">Business Type</h2>
			<p class="text-terminal-dim text-sm mb-3">
				Choose your business type to see relevant dashboard templates
			</p>
			<BusinessTypeSelect />
		</section>

		<!-- API Keys Info -->
		<section class="terminal-window p-4">
			<h2 class="text-terminal-amber font-bold mb-4">API Keys</h2>
			<p class="text-terminal-dim text-sm mb-3">
				API keys are configured via environment variables on the server:
			</p>
			<ul class="text-terminal-dim text-sm space-y-1">
				<li><code class="text-terminal-accent">ANTHROPIC_API_KEY</code> - Claude</li>
				<li><code class="text-terminal-accent">OPENAI_API_KEY</code> - OpenAI</li>
				<li><code class="text-terminal-accent">GOOGLE_API_KEY</code> - Gemini</li>
			</ul>
		</section>

		<!-- Data Source -->
		<section class="terminal-window p-4">
			<h2 class="text-terminal-amber font-bold mb-4">Data Source</h2>
			<p class="text-terminal-dim text-sm">
				Connected to Snowflake (ANALYTICS_POC.SAAS_DEMO)
			</p>
			<p class="text-terminal-dim text-xs mt-2">
				Configure connection in <code class="text-terminal-accent">sources/snowflake_saas/connection.yaml</code>
			</p>
		</section>
	</div>
</div>
