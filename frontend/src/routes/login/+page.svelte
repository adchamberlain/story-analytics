<script lang="ts">
	import { requestMagicLink } from '$lib/api';

	let email = '';
	let error = '';
	let loading = false;
	let emailSent = false;
	let sentToEmail = '';

	async function handleSubmit() {
		error = '';
		loading = true;

		try {
			const response = await requestMagicLink(email);
			emailSent = true;
			sentToEmail = response.email;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to send link';
		} finally {
			loading = false;
		}
	}

	function tryAgain() {
		emailSent = false;
		sentToEmail = '';
	}
</script>

<div class="min-h-screen bg-terminal-bg flex items-center justify-center p-4">
	<div class="terminal-window w-full max-w-md">
		<div class="terminal-header">
			<div class="terminal-dot terminal-dot-red"></div>
			<div class="terminal-dot terminal-dot-yellow"></div>
			<div class="terminal-dot terminal-dot-green"></div>
			<span class="text-terminal-dim text-sm ml-2">login</span>
		</div>

		<div class="p-6">
			<h1 class="text-terminal-accent font-bold text-2xl tracking-widest mb-1">
				STORY<span class="inline-block w-2 h-5 bg-terminal-accent ml-1 align-middle cursor-blink"></span>
			</h1>
			<p class="text-terminal-dim text-sm mb-4">AI-native analytics.</p>

			{#if emailSent}
				<!-- Success state -->
				<div class="py-8 text-center">
					<div class="text-terminal-accent text-4xl mb-4">✓</div>
					<p class="text-terminal-text mb-2">Check your email!</p>
					<p class="text-terminal-dim text-sm mb-6">
						We sent a sign-in link to<br />
						<span class="text-terminal-amber">{sentToEmail}</span>
					</p>
					<p class="text-terminal-dim text-xs mb-6">
						The link expires in 15 minutes.
					</p>
					<button
						on:click={tryAgain}
						class="text-terminal-dim hover:text-terminal-text text-sm underline"
					>
						Use a different email
					</button>
				</div>
			{:else}
				<!-- Login form -->
				<p class="text-terminal-dim text-sm mb-6">
					Enter your email to sign in
				</p>

				<form on:submit|preventDefault={handleSubmit} class="space-y-4">
					<div>
						<label for="email" class="block text-terminal-dim text-sm mb-1">Email</label>
						<input
							type="email"
							id="email"
							bind:value={email}
							required
							class="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2
                               text-terminal-text focus:border-terminal-accent"
							placeholder="you@example.com"
						/>
					</div>

					{#if error}
						<p class="text-terminal-red text-sm">{error}</p>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full btn-terminal btn-terminal-primary disabled:opacity-50"
					>
						{loading ? 'Sending...' : 'Send link'}
					</button>
				</form>

				<p class="mt-6 text-center text-terminal-dim text-xs">
					We'll email you a link to sign in instantly.<br />
					No password needed.
				</p>
			{/if}
		</div>
	</div>
</div>
