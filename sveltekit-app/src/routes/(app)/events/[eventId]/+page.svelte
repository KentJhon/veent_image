<script lang="ts">
	import { page } from '$app/stores';

	let event = $state<{
		id: string;
		name: string;
		description: string | null;
		date: string;
		venue: string | null;
		pricingPerPhoto: number | null;
		pricingBundle: number | null;
		immichAlbumId: string | null;
	} | null>(null);
	let loading = $state(true);

	$effect(() => {
		fetch(`/api/events/${$page.params.eventId}`)
			.then((r) => r.json())
			.then((data) => {
				event = data;
				loading = false;
			});
	});
</script>

{#if loading}
	<p class="loading">Loading event...</p>
{:else if event}
	{#if !event.immichAlbumId}
		<div class="warning-banner">
			Photo storage not yet connected. The Immich service may be offline. Photos, uploads, and face matching will be available once it's running.
		</div>
	{/if}
	<div class="event-header">
		<h1>{event.name}</h1>
		<div class="event-meta">
			<span class="date">
				{new Date(event.date).toLocaleDateString('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				})}
			</span>
			{#if event.venue}
				<span class="venue">{event.venue}</span>
			{/if}
		</div>
		{#if event.description}
			<p class="description">{event.description}</p>
		{/if}
	</div>

	<div class="actions">
		<a href="/events/{event.id}/photos" class="action-card">
			<h3>Browse Photos</h3>
			<p>View all event photos</p>
		</a>
		<a href="/events/{event.id}/my-photos" class="action-card highlight">
			<h3>Find My Photos</h3>
			<p>Upload a selfie to find photos of you</p>
		</a>
		<a href="/events/{event.id}/upload" class="action-card">
			<h3>Upload Photos</h3>
			<p>Photographers: upload event photos</p>
		</a>
		<a href="/events/{event.id}/manage" class="action-card">
			<h3>Manage Event</h3>
			<p>Assign photographers, edit settings</p>
		</a>
	</div>

	{#if event.pricingPerPhoto}
		<div class="pricing">
			<h3>Pricing</h3>
			<p>Individual photo: ${(event.pricingPerPhoto / 100).toFixed(2)}</p>
			{#if event.pricingBundle}
				<p>Photo bundle: ${(event.pricingBundle / 100).toFixed(2)}</p>
			{/if}
		</div>
	{/if}
{:else}
	<p class="loading">Event not found.</p>
{/if}

<style>
	.event-header {
		margin-bottom: 3rem;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.event-meta {
		display: flex;
		gap: 1.5rem;
		color: #888;
		margin-bottom: 1rem;
	}

	.date {
		color: #2563eb;
	}

	.description {
		color: #aaa;
		line-height: 1.6;
		max-width: 700px;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.action-card {
		background: #151515;
		border: 1px solid #222;
		border-radius: 12px;
		padding: 2rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.2s;
	}

	.action-card:hover {
		border-color: #2563eb;
	}

	.action-card.highlight {
		border-color: #7c3aed;
		background: linear-gradient(135deg, #151515, #1a1030);
	}

	.action-card h3 {
		font-size: 1.2rem;
		margin-bottom: 0.5rem;
		color: #fff;
	}

	.action-card p {
		color: #888;
		font-size: 0.9rem;
	}

	.pricing {
		background: #151515;
		border: 1px solid #222;
		border-radius: 12px;
		padding: 1.5rem;
		max-width: 400px;
	}

	.warning-banner {
		background: #2d2200;
		border: 1px solid #eab308;
		color: #eab308;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.pricing h3 {
		margin-bottom: 0.5rem;
		color: #fff;
	}

	.pricing p {
		color: #aaa;
		font-size: 0.9rem;
	}

	.loading {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}
</style>
