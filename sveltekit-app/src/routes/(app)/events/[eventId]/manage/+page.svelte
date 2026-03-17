<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const eventId = $page.params.eventId!;

	interface EventData {
		id: string;
		name: string;
		description: string | null;
		date: string;
		venue: string | null;
		pricingPerPhoto: number | null;
		pricingBundle: number | null;
	}

	interface Photographer {
		assignmentId: string;
		userId: string;
		role: string | null;
		userName: string | null;
		userEmail: string;
	}

	let event = $state<EventData | null>(null);
	let photographers = $state<Photographer[]>([]);
	let loading = $state(true);

	// Photographer assignment
	let newPhotographerEmail = $state('');
	let assignError = $state('');
	let assigning = $state(false);

	$effect(() => {
		Promise.all([
			fetch(`/api/events/${eventId}`).then((r) => r.json()),
			fetch(`/api/events/${eventId}/photographers`).then((r) => r.json())
		]).then(([eventData, photographerData]) => {
			event = eventData;
			photographers = photographerData;
			loading = false;
		});
	});

	async function assignPhotographer() {
		if (!newPhotographerEmail.trim()) return;
		assigning = true;
		assignError = '';

		try {
			// First we need to find user by email - we'll pass email and let the backend resolve
			const res = await fetch(`/api/events/${eventId}/photographers`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: newPhotographerEmail.trim() })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				assignError = data.message ?? `Error: ${res.status}`;
				return;
			}

			// Refresh list
			const updated = await fetch(`/api/events/${eventId}/photographers`).then((r) => r.json());
			photographers = updated;
			newPhotographerEmail = '';
		} catch {
			assignError = 'Failed to assign photographer';
		} finally {
			assigning = false;
		}
	}

	async function removePhotographer(assignmentId: string) {
		try {
			await fetch(`/api/events/${eventId}/photographers`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId })
			});

			photographers = photographers.filter((p) => p.assignmentId !== assignmentId);
		} catch {
			// ignore
		}
	}
</script>

<div class="page-header">
	<a href="/events/{eventId}" class="back">&larr; Back to event</a>
	<h1>Manage Event</h1>
</div>

{#if loading}
	<p class="loading">Loading...</p>
{:else if event}
	<section class="section">
		<h2>Event Details</h2>
		<div class="detail-grid">
			<div class="detail">
				<span class="label">Name</span>
				<span class="value">{event.name}</span>
			</div>
			<div class="detail">
				<span class="label">Date</span>
				<span class="value">{new Date(event.date).toLocaleDateString()}</span>
			</div>
			<div class="detail">
				<span class="label">Venue</span>
				<span class="value">{event.venue ?? '—'}</span>
			</div>
			<div class="detail">
				<span class="label">Per Photo</span>
				<span class="value">${((event.pricingPerPhoto ?? 500) / 100).toFixed(2)}</span>
			</div>
			<div class="detail">
				<span class="label">Bundle</span>
				<span class="value">${((event.pricingBundle ?? 2000) / 100).toFixed(2)}</span>
			</div>
		</div>
	</section>

	<section class="section">
		<h2>Photographers</h2>
		<p class="section-desc">Assigned photographers can upload photos to this event.</p>

		{#if photographers.length > 0}
			<ul class="photographer-list">
				{#each photographers as p}
					<li>
						<div class="photographer-info">
							<span class="photographer-name">{p.userName ?? p.userEmail}</span>
							<span class="photographer-email">{p.userEmail}</span>
						</div>
						<button class="remove-btn" onclick={() => removePhotographer(p.assignmentId)}>
							Remove
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty-note">No photographers assigned yet.</p>
		{/if}

		<div class="assign-form">
			{#if assignError}
				<p class="error">{assignError}</p>
			{/if}
			<div class="assign-row">
				<input
					type="email"
					bind:value={newPhotographerEmail}
					placeholder="photographer@email.com"
					disabled={assigning}
				/>
				<button onclick={assignPhotographer} disabled={assigning || !newPhotographerEmail.trim()}>
					{assigning ? 'Adding...' : 'Add Photographer'}
				</button>
			</div>
		</div>
	</section>

	<section class="section">
		<h2>Quick Links</h2>
		<div class="links">
			<a href="/events/{eventId}/upload">Upload Photos</a>
			<a href="/events/{eventId}/photos">View Gallery</a>
		</div>
	</section>
{/if}

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
		font-size: 1.8rem;
	}

	.section {
		background: #151515;
		border: 1px solid #222;
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.2rem;
		margin-bottom: 0.75rem;
		color: #fff;
	}

	.section-desc {
		color: #888;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}

	.detail .label {
		display: block;
		font-size: 0.75rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.2rem;
	}

	.detail .value {
		color: #ddd;
		font-size: 0.95rem;
	}

	.photographer-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
	}

	.photographer-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 0;
		border-bottom: 1px solid #222;
	}

	.photographer-list li:last-child {
		border-bottom: none;
	}

	.photographer-name {
		color: #ddd;
		font-weight: 500;
	}

	.photographer-email {
		color: #666;
		font-size: 0.8rem;
		margin-left: 0.5rem;
	}

	.remove-btn {
		background: transparent;
		color: #ef4444;
		border: 1px solid #ef4444;
		padding: 0.3rem 0.8rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.remove-btn:hover {
		background: #2d1515;
	}

	.empty-note {
		color: #666;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.assign-row {
		display: flex;
		gap: 0.75rem;
	}

	.assign-row input {
		flex: 1;
		padding: 0.55rem 0.8rem;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 8px;
		color: #e0e0e0;
		font-size: 0.9rem;
	}

	.assign-row input:focus {
		outline: none;
		border-color: #2563eb;
	}

	.assign-row button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.55rem 1.2rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.assign-row button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		color: #ef4444;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.links {
		display: flex;
		gap: 1rem;
	}

	.links a {
		color: #2563eb;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.links a:hover {
		text-decoration: underline;
	}

	.loading {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}
</style>
