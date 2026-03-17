<script lang="ts">
	let events = $state<Array<{
		id: string;
		name: string;
		description: string | null;
		date: string;
		venue: string | null;
	}>>([]);
	let loading = $state(true);

	$effect(() => {
		fetch('/api/events')
			.then((r) => r.json())
			.then((data) => {
				events = data;
				loading = false;
			});
	});
</script>

<div class="page-header">
	<h1>Events</h1>
	<a href="/events/new" class="create-btn">+ Create Event</a>
</div>

{#if loading}
	<p class="loading">Loading events...</p>
{:else if events.length === 0}
	<p class="empty">No events yet.</p>
{:else}
	<div class="events-grid">
		{#each events as event}
			<a href="/events/{event.id}" class="event-card">
				<div class="event-date">
					{new Date(event.date).toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric',
						year: 'numeric'
					})}
				</div>
				<h2>{event.name}</h2>
				{#if event.venue}
					<p class="venue">{event.venue}</p>
				{/if}
				{#if event.description}
					<p class="description">{event.description}</p>
				{/if}
			</a>
		{/each}
	</div>
{/if}

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2rem;
	}

	.create-btn {
		background: #2563eb;
		color: #fff;
		padding: 0.55rem 1.2rem;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.create-btn:hover {
		background: #1d4ed8;
	}

	.events-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.event-card {
		background: #151515;
		border: 1px solid #222;
		border-radius: 12px;
		padding: 1.5rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.2s;
	}

	.event-card:hover {
		border-color: #2563eb;
	}

	.event-date {
		color: #2563eb;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	h2 {
		font-size: 1.3rem;
		margin-bottom: 0.5rem;
		color: #fff;
	}

	.venue {
		color: #888;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}

	.description {
		color: #666;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.loading,
	.empty {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}
</style>
