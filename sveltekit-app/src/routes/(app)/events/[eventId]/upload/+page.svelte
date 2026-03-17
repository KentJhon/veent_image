<script lang="ts">
	import { page } from '$app/stores';
	import PhotoUploader from '$lib/components/PhotoUploader.svelte';

	const eventId = $page.params.eventId!;
	let eventName = $state('');
	let uploadCount = $state(0);

	$effect(() => {
		fetch(`/api/events/${eventId}`)
			.then((r) => r.json())
			.then((e) => (eventName = e.name));
	});

	function handleUploadComplete() {
		uploadCount++;
	}
</script>

<div class="page-header">
	<a href="/events/{eventId}" class="back">&larr; Back to event</a>
	<h1>Upload Photos{eventName ? ` - ${eventName}` : ''}</h1>
</div>

<p class="instructions">
	Upload event photos here. Once uploaded, our AI will automatically detect faces
	for attendee face matching. Photos will appear in the event gallery with a watermark.
</p>

<PhotoUploader {eventId} onUploadComplete={handleUploadComplete} />

{#if uploadCount > 0}
	<div class="post-upload">
		<p>Photos are being processed. Face detection runs automatically.</p>
		<a href="/events/{eventId}/photos">View Event Gallery</a>
	</div>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.back {
		color: #888;
		text-decoration: none;
		font-size: 0.9rem;
	}

	h1 {
		font-size: 1.5rem;
	}

	.instructions {
		color: #888;
		font-size: 0.9rem;
		line-height: 1.5;
		margin-bottom: 1.5rem;
		max-width: 700px;
	}

	.post-upload {
		margin-top: 1.5rem;
		padding: 1rem 1.5rem;
		background: #0d1f0d;
		border: 1px solid #22c55e;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.post-upload p {
		color: #aaa;
		margin-bottom: 0.5rem;
	}

	.post-upload a {
		color: #2563eb;
		text-decoration: none;
	}

	.post-upload a:hover {
		text-decoration: underline;
	}
</style>
