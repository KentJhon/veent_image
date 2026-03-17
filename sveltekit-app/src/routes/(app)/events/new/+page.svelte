<script lang="ts">
	import { goto } from '$app/navigation';

	let name = $state('');
	let description = $state('');
	let date = $state('');
	let venue = $state('');
	let pricingPerPhoto = $state(5);
	let pricingBundle = $state(20);
	let submitting = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name || !date) return;

		submitting = true;
		errorMsg = '';

		try {
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					description: description || undefined,
					date,
					venue: venue || undefined,
					pricingPerPhoto: Math.round(pricingPerPhoto * 100),
					pricingBundle: Math.round(pricingBundle * 100)
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				errorMsg = data.message ?? `Error: ${res.status}`;
				return;
			}

			const data = await res.json();
			if (!data.immichConnected) {
				// Event created but Immich album not provisioned — still navigate
				console.warn('Event created but Immich album was not provisioned (Immich may be offline)');
			}
			goto(`/events/${data.event.id}`);
		} catch {
			errorMsg = 'Failed to create event. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="page-header">
	<a href="/events" class="back">&larr; Back to events</a>
	<h1>Create New Event</h1>
</div>

{#if errorMsg}
	<div class="error-banner">{errorMsg}</div>
{/if}

<form onsubmit={handleSubmit} class="event-form">
	<div class="field">
		<label for="name">Event Name *</label>
		<input id="name" type="text" bind:value={name} required placeholder="Summer Music Festival" />
	</div>

	<div class="field">
		<label for="date">Date *</label>
		<input id="date" type="datetime-local" bind:value={date} required />
	</div>

	<div class="field">
		<label for="venue">Venue</label>
		<input id="venue" type="text" bind:value={venue} placeholder="Madison Square Garden" />
	</div>

	<div class="field">
		<label for="description">Description</label>
		<textarea id="description" bind:value={description} rows="3" placeholder="Tell attendees about this event..."></textarea>
	</div>

	<div class="field-row">
		<div class="field">
			<label for="pricePhoto">Price per Photo ($)</label>
			<input id="pricePhoto" type="number" bind:value={pricingPerPhoto} min="0" step="0.01" />
		</div>
		<div class="field">
			<label for="priceBundle">Bundle Price ($)</label>
			<input id="priceBundle" type="number" bind:value={pricingBundle} min="0" step="0.01" />
		</div>
	</div>

	<button type="submit" disabled={submitting || !name || !date}>
		{submitting ? 'Creating...' : 'Create Event'}
	</button>
</form>

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

	.error-banner {
		background: #2d1515;
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
	}

	.event-form {
		max-width: 600px;
	}

	.field {
		margin-bottom: 1.5rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.85rem;
		color: #aaa;
		font-weight: 500;
	}

	input, textarea {
		width: 100%;
		padding: 0.65rem 0.8rem;
		background: #151515;
		border: 1px solid #333;
		border-radius: 8px;
		color: #e0e0e0;
		font-size: 0.95rem;
		font-family: inherit;
		box-sizing: border-box;
	}

	input:focus, textarea:focus {
		outline: none;
		border-color: #2563eb;
	}

	textarea {
		resize: vertical;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.75rem 2rem;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 0.5rem;
	}

	button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
