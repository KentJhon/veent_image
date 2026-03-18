<script lang="ts">
	import { page } from '$app/stores';
	import SelfieCapture from '$lib/components/SelfieCapture.svelte';
	import TextSearch from '$lib/components/TextSearch.svelte';
	import PhotoGrid from '$lib/components/PhotoGrid.svelte';
	import PhotoLightbox from '$lib/components/PhotoLightbox.svelte';

	const eventId = $page.params.eventId!;

	interface DistanceInfo {
		assetId: string;
		distance: number;
	}

	let matchedAssetIds = $state<string[]>([]);
	let selectedIds = $state<string[]>([]);
	let distances = $state<DistanceInfo[]>([]);
	let status = $state<'loading' | 'idle' | 'processing' | 'results' | 'error'>('loading');
	let searchMethod = $state<'face' | 'text' | null>(null);
	let errorMessage = $state('');
	let totalMatches = $state(0);
	let facesDetected = $state(0);
	let sessionId = $state<string | null>(null);
	let eventName = $state('');
	let lightboxId = $state<string | null>(null);

	let selfieCapture = $state<SelfieCapture | null>(null);

	// On mount: fetch event name and check for cached session
	$effect(() => {
		fetch(`/api/events/${eventId}`)
			.then((r) => r.json())
			.then((e) => (eventName = e.name));

		// Check for a cached session
		fetch(`/api/face-match?eventId=${eventId}`)
			.then((r) => r.json())
			.then((data) => {
				if (data.found && data.matched) {
					matchedAssetIds = data.assetIds ?? [];
					totalMatches = data.totalMatches ?? 0;
					sessionId = data.sessionId;
					searchMethod = 'face';
					status = 'results';
				} else {
					status = 'idle';
				}
			})
			.catch(() => {
				status = 'idle';
			});
	});

	async function handleSelfie(file: File) {
		status = 'processing';
		searchMethod = 'face';
		errorMessage = '';

		const formData = new FormData();
		formData.append('selfie', file);
		formData.append('eventId', eventId);

		try {
			const res = await fetch('/api/face-match', {
				method: 'POST',
				body: formData
			});

			const data = await res.json();

			if (data.error && !data.matched) {
				status = 'error';
				errorMessage = data.error;
				return;
			}

			matchedAssetIds = data.assetIds ?? [];
			distances = data.distances ?? [];
			totalMatches = data.totalMatches ?? 0;
			facesDetected = data.facesDetected ?? 0;
			sessionId = data.sessionId ?? null;
			status = 'results';
		} catch {
			status = 'error';
			errorMessage = 'Something went wrong. Please try again.';
		}
	}

	function toggleSelect(assetId: string) {
		if (selectedIds.includes(assetId)) {
			selectedIds = selectedIds.filter((id) => id !== assetId);
		} else {
			selectedIds = [...selectedIds, assetId];
		}
	}

	function selectAll() {
		selectedIds = [...matchedAssetIds];
	}

	function deselectAll() {
		selectedIds = [];
	}

	function handleTextResults(assetIds: string[]) {
		matchedAssetIds = assetIds;
		totalMatches = assetIds.length;
		distances = [];
		facesDetected = 0;
		searchMethod = 'text';
		status = 'results';
	}

	function reset() {
		status = 'idle';
		searchMethod = null;
		matchedAssetIds = [];
		selectedIds = [];
		distances = [];
		errorMessage = '';
		sessionId = null;
		facesDetected = 0;
		selfieCapture?.reset();
	}

	function openLightbox(assetId: string) {
		lightboxId = assetId;
	}

	function closeLightbox() {
		lightboxId = null;
	}

	function prevPhoto() {
		if (!lightboxId) return;
		const idx = matchedAssetIds.indexOf(lightboxId);
		if (idx > 0) lightboxId = matchedAssetIds[idx - 1];
	}

	function nextPhoto() {
		if (!lightboxId) return;
		const idx = matchedAssetIds.indexOf(lightboxId);
		if (idx < matchedAssetIds.length - 1) lightboxId = matchedAssetIds[idx + 1];
	}

	function getConfidence(assetId: string): string {
		const d = distances.find((x) => x.assetId === assetId);
		if (!d) return '';
		if (d.distance < 0.35) return 'High match';
		if (d.distance < 0.5) return 'Good match';
		return 'Possible match';
	}

	let purchasing = $state(false);
	let purchaseMessage = $state('');

	async function handleBuy() {
		if (selectedIds.length === 0) return;
		purchasing = true;
		purchaseMessage = '';

		try {
			const res = await fetch('/api/purchases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ eventId, assetIds: selectedIds })
			});

			const data = await res.json();

			if (data.alreadyPurchased) {
				purchaseMessage = data.error;
				return;
			}

			if (!res.ok) {
				purchaseMessage = data.message ?? 'Purchase failed';
				return;
			}

			// With stub payment: mark as successful immediately
			// With real Stripe: redirect to checkout using data.clientSecret
			purchaseMessage = `Purchase initiated for ${data.assetCount} photo(s) — $${(data.amountCents / 100).toFixed(2)}. Check "My Purchases" to download.`;
			selectedIds = [];
		} catch {
			purchaseMessage = 'Something went wrong. Please try again.';
		} finally {
			purchasing = false;
		}
	}

	let lightboxIdx = $derived(lightboxId ? matchedAssetIds.indexOf(lightboxId) : -1);
	let allSelected = $derived(selectedIds.length === matchedAssetIds.length && matchedAssetIds.length > 0);
</script>

<div class="page-header">
	<a href="/events/{eventId}" class="back">&larr; Back to event</a>
	<h1>Find My Photos{eventName ? ` - ${eventName}` : ''}</h1>
</div>

{#if status === 'loading'}
	<div class="processing">
		<div class="spinner"></div>
		<p>Checking for previous results...</p>
	</div>
{:else if status === 'idle'}
	<div class="search-options">
		<div class="search-option">
			<h2>Find by Text</h2>
			<p class="option-desc">Search for text detected in photos — bib numbers, signs, banners, names on badges.</p>
			<TextSearch {eventId} onResults={handleTextResults} />
		</div>

		<div class="or-divider">
			<span>or</span>
		</div>

		<div class="search-option">
			<h2>Find with Face Recognition</h2>
			<p class="option-desc">Upload a selfie or take a photo. Our AI will find all photos of you from this event.</p>
			<SelfieCapture bind:this={selfieCapture} onCapture={handleSelfie} />
		</div>
	</div>
{:else if status === 'processing'}
	<div class="processing">
		<div class="spinner"></div>
		<p>Analyzing your photo and searching for matches...</p>
		<p class="sub">This usually takes 3-5 seconds</p>
	</div>
{:else if status === 'results'}
	<div class="results-header">
		<div>
			<h2>
				{#if totalMatches > 0}
					Found {totalMatches} photo{totalMatches === 1 ? '' : 's'} of you
				{:else}
					No matching photos found
				{/if}
			</h2>
			{#if facesDetected > 1}
				<p class="faces-note">
					{facesDetected} faces detected in your selfie &mdash; matched using the most prominent face.
				</p>
			{/if}
		</div>
		<div class="results-actions">
			{#if matchedAssetIds.length > 0}
				{#if allSelected}
					<button onclick={deselectAll} class="secondary">Deselect All</button>
				{:else}
					<button onclick={selectAll} class="secondary">Select All</button>
				{/if}
				{#if selectedIds.length > 0}
					<button class="buy-btn" onclick={handleBuy} disabled={purchasing}>
						{purchasing ? 'Processing...' : `Buy ${selectedIds.length} Photo${selectedIds.length === 1 ? '' : 's'}`}
					</button>
				{/if}
			{/if}
			<button onclick={reset} class="tertiary">New Search</button>
		</div>
	</div>

	{#if purchaseMessage}
		<div class="purchase-banner" class:error={purchaseMessage.includes('failed') || purchaseMessage.includes('already')}>
			<p>{purchaseMessage}</p>
			{#if purchaseMessage.includes('My Purchases')}
				<a href="/purchases">Go to My Purchases</a>
			{/if}
		</div>
	{/if}

	{#if matchedAssetIds.length > 0}
		<div class="results-grid">
			{#each matchedAssetIds as assetId}
				<div class="result-item" class:selected={selectedIds.includes(assetId)}>
					<button
						class="result-photo"
						onclick={() => toggleSelect(assetId)}
						type="button"
					>
						<img
							src="/api/photos/{assetId}?size=thumbnail"
							alt=""
							loading="lazy"
						/>
						{#if selectedIds.includes(assetId)}
							<div class="check-badge">&#10003;</div>
						{/if}
					</button>
					<div class="result-meta">
						{#if getConfidence(assetId)}
							<span class="confidence" class:high={getConfidence(assetId) === 'High match'} class:good={getConfidence(assetId) === 'Good match'}>
								{getConfidence(assetId)}
							</span>
						{/if}
						<button class="expand-btn" onclick={() => openLightbox(assetId)} type="button" aria-label="View full size">
							&#x26F6;
						</button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="no-matches">
			{#if searchMethod === 'text'}
				<p>No photos with matching text were found in this event.</p>
				<p class="sub">Try different keywords, or the photos may not have been processed for OCR yet.</p>
			{:else}
				<p>No matching photos were found for your face in this event.</p>
				<p class="sub">Try a different photo with better lighting, or the photos may not have been processed yet.</p>
			{/if}
			<button onclick={reset}>New Search</button>
		</div>
	{/if}
{:else if status === 'error'}
	<div class="error-section">
		<p class="error">{errorMessage}</p>
		<button onclick={reset}>Try Again</button>
	</div>
{/if}

<PhotoLightbox
	assetId={lightboxId}
	onclose={closeLightbox}
	onprev={prevPhoto}
	onnext={nextPhoto}
	hasPrev={lightboxIdx > 0}
	hasNext={lightboxIdx < matchedAssetIds.length - 1}
/>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.back {
		color: #888;
		text-decoration: none;
		font-size: 0.9rem;
	}

	h1 {
		font-size: 1.5rem;
	}

	.search-options {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
		padding: 2rem 0;
	}

	.search-option {
		flex: 1;
		text-align: center;
		padding: 1.5rem;
		background: #0a0a0a;
		border: 1px solid #222;
		border-radius: 12px;
	}

	.search-option h2 {
		font-size: 1.15rem;
		margin-bottom: 0.5rem;
	}

	.option-desc {
		color: #888;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
	}

	.or-divider {
		display: flex;
		align-items: center;
		padding-top: 4rem;
	}

	.or-divider span {
		color: #555;
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	@media (max-width: 768px) {
		.search-options {
			flex-direction: column;
		}

		.or-divider {
			padding-top: 0;
			justify-content: center;
		}
	}

	.processing {
		text-align: center;
		padding: 4rem 0;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #333;
		border-top-color: #2563eb;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1.5rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.processing p {
		color: #aaa;
	}

	.processing .sub {
		color: #666;
		font-size: 0.85rem;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.results-header h2 {
		font-size: 1.3rem;
		margin-bottom: 0.25rem;
	}

	.faces-note {
		color: #888;
		font-size: 0.8rem;
	}

	.results-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.55rem 1.1rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}

	button:hover {
		background: #1d4ed8;
	}

	.buy-btn {
		background: linear-gradient(135deg, #2563eb, #7c3aed);
	}

	.buy-btn:hover {
		background: linear-gradient(135deg, #1d4ed8, #6d28d9);
	}

	button.secondary {
		background: #333;
	}

	button.secondary:hover {
		background: #444;
	}

	button.tertiary {
		background: transparent;
		border: 1px solid #333;
		color: #aaa;
	}

	button.tertiary:hover {
		border-color: #555;
		color: #fff;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.result-item {
		border: 2px solid transparent;
		border-radius: 10px;
		overflow: hidden;
		background: #111;
		transition: border-color 0.15s;
	}

	.result-item.selected {
		border-color: #2563eb;
	}

	.result-photo {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		position: relative;
	}

	.result-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.check-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		background: #2563eb;
		color: #fff;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: bold;
	}

	.result-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
	}

	.confidence {
		font-size: 0.7rem;
		font-weight: 600;
		color: #888;
	}

	.confidence.high {
		color: #22c55e;
	}

	.confidence.good {
		color: #eab308;
	}

	.expand-btn {
		background: none;
		border: none;
		color: #666;
		font-size: 1rem;
		padding: 0.2rem 0.4rem;
		cursor: pointer;
		border-radius: 4px;
	}

	.expand-btn:hover {
		color: #fff;
		background: #333;
	}

	.no-matches {
		text-align: center;
		padding: 3rem 0;
	}

	.no-matches p {
		color: #888;
		margin-bottom: 0.5rem;
	}

	.no-matches .sub {
		color: #666;
		font-size: 0.85rem;
		margin-bottom: 1.5rem;
	}

	.error-section {
		text-align: center;
		padding: 3rem 0;
	}

	.purchase-banner {
		background: #0d1f0d;
		border: 1px solid #22c55e;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
	}

	.purchase-banner p {
		color: #aaa;
	}

	.purchase-banner a {
		color: #2563eb;
		text-decoration: none;
		font-size: 0.85rem;
	}

	.purchase-banner.error {
		background: #2d1515;
		border-color: #ef4444;
	}

	.error {
		color: #ef4444;
		margin-bottom: 1.5rem;
	}
</style>
