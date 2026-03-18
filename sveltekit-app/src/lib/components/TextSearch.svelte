<script lang="ts">
	interface Props {
		eventId: string;
		onResults: (assetIds: string[]) => void;
		disabled?: boolean;
	}

	let { eventId, onResults, disabled = false }: Props = $props();

	let query = $state('');
	let mode = $state<'contains' | 'exact' | 'startsWith' | 'endsWith'>('contains');
	let loading = $state(false);
	let errorMessage = $state('');

	async function search() {
		const trimmed = query.trim();
		if (!trimmed) return;

		loading = true;
		errorMessage = '';

		try {
			const res = await fetch(`/api/events/${eventId}/text-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: trimmed, mode })
			});

			const data = await res.json();

			if (!res.ok) {
				errorMessage = data.message ?? 'Search failed';
				return;
			}

			onResults(data.assetIds ?? []);
		} catch {
			errorMessage = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !disabled && !loading) {
			search();
		}
	}
</script>

<div class="text-search">
	<div class="search-icon">
		<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<circle cx="11" cy="11" r="8"/>
			<path d="m21 21-4.35-4.35"/>
			<path d="M8 8h6M8 12h4" stroke-opacity="0.5"/>
		</svg>
	</div>

	<div class="search-input-row">
		<input
			type="text"
			bind:value={query}
			onkeydown={handleKeydown}
			placeholder="Search for text in photos..."
			{disabled}
		/>
		<button onclick={search} disabled={disabled || loading || !query.trim()} type="button">
			{loading ? 'Searching...' : 'Search'}
		</button>
	</div>

	<div class="mode-row">
		<label class:active={mode === 'contains'}>
			<input type="radio" bind:group={mode} value="contains" />
			Contains
		</label>
		<label class:active={mode === 'exact'}>
			<input type="radio" bind:group={mode} value="exact" />
			Exact Match
		</label>
		<label class:active={mode === 'startsWith'}>
			<input type="radio" bind:group={mode} value="startsWith" />
			Starts With
		</label>
		<label class:active={mode === 'endsWith'}>
			<input type="radio" bind:group={mode} value="endsWith" />
			Ends With
		</label>
	</div>

	<div class="tips">
		<p>Search examples:</p>
		<ul>
			<li>Bib numbers (e.g. "1234")</li>
			<li>Signs or banners text</li>
			<li>Names on jerseys or badges</li>
		</ul>
	</div>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}
</div>

<style>
	.text-search {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		max-width: 480px;
		margin: 0 auto;
	}

	.search-icon {
		color: #444;
	}

	.search-input-row {
		display: flex;
		width: 100%;
		gap: 0.5rem;
	}

	input[type="text"] {
		flex: 1;
		background: #111;
		border: 1px solid #333;
		color: #fff;
		padding: 0.7rem 1rem;
		border-radius: 8px;
		font-size: 1rem;
		outline: none;
	}

	input[type="text"]:focus {
		border-color: #2563eb;
	}

	input[type="text"]::placeholder {
		color: #555;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.7rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		white-space: nowrap;
	}

	button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.mode-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.mode-row label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		border: 1px solid #333;
		color: #888;
		font-size: 0.8rem;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.mode-row label.active {
		border-color: #2563eb;
		color: #fff;
	}

	.mode-row input[type="radio"] {
		display: none;
	}

	.tips {
		background: #151515;
		border: 1px solid #222;
		border-radius: 10px;
		padding: 1rem 1.25rem;
		font-size: 0.8rem;
		width: 100%;
		max-width: 320px;
	}

	.tips p {
		color: #888;
		margin-bottom: 0.4rem;
		font-weight: 600;
	}

	.tips ul {
		margin: 0;
		padding-left: 1.2rem;
		color: #666;
	}

	.tips li {
		margin-bottom: 0.15rem;
	}

	.error {
		color: #ef4444;
		font-size: 0.85rem;
	}
</style>
