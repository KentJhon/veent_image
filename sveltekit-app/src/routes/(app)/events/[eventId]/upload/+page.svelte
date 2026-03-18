<script lang="ts">
	import { page } from '$app/stores';
	import PhotoUploader from '$lib/components/PhotoUploader.svelte';

	const eventId = $page.params.eventId!;
	let eventName = $state('');
	let uploadCount = $state(0);

	interface JobInfo {
		name: string;
		active: number;
		waiting: number;
		completed: number;
		failed: number;
	}

	let processingDone = $state(false);
	let jobs = $state<JobInfo[]>([]);
	let pollTimer = $state<ReturnType<typeof setInterval> | null>(null);

	$effect(() => {
		fetch(`/api/events/${eventId}`)
			.then((r) => r.json())
			.then((e) => (eventName = e.name));
	});

	function handleUploadComplete() {
		uploadCount++;
		// Start polling job status after first upload
		if (!pollTimer) {
			processingDone = false;
			pollJobs();
			pollTimer = setInterval(pollJobs, 2000);
		}
	}

	async function pollJobs() {
		try {
			const res = await fetch('/api/jobs');
			const data = await res.json();
			jobs = data.jobs ?? [];
			if (data.done) {
				processingDone = true;
				if (pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
			}
		} catch {
			// ignore transient errors
		}
	}

	function jobLabel(name: string): string {
		const labels: Record<string, string> = {
			thumbnailGeneration: 'Thumbnails',
			metadataExtraction: 'Metadata',
			smartSearch: 'Smart Search',
			faceDetection: 'Face Detection',
			facialRecognition: 'Face Recognition'
		};
		return labels[name] ?? name;
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
	<div class="post-upload" class:done={processingDone}>
		{#if processingDone}
			<p class="done-text">All processing complete! Face detection finished.</p>
			<div class="post-links">
				<a href="/events/{eventId}/photos">View Event Gallery</a>
				<a href="/events/{eventId}/my-photos">Find My Photos</a>
			</div>
		{:else}
			<p>Processing uploads...</p>
			<div class="job-list">
				{#each jobs as job}
					{@const pending = job.active + job.waiting}
					<div class="job-row">
						<span class="job-label">{jobLabel(job.name)}</span>
						<div class="job-bar-track">
							{#if pending > 0}
								<div class="job-bar-fill pulsing"></div>
							{:else}
								<div class="job-bar-fill full"></div>
							{/if}
						</div>
						<span class="job-status">
							{#if pending > 0}
								{pending} pending
							{:else}
								done
							{/if}
						</span>
					</div>
				{/each}
			</div>
		{/if}
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
		background: #111827;
		border: 1px solid #374151;
		border-radius: 8px;
		font-size: 0.9rem;
		transition: border-color 0.3s, background 0.3s;
	}

	.post-upload.done {
		background: #0d1f0d;
		border-color: #22c55e;
	}

	.post-upload p {
		color: #aaa;
		margin-bottom: 0.75rem;
	}

	.done-text {
		color: #22c55e !important;
		font-weight: 600;
	}

	.post-links {
		display: flex;
		gap: 1.5rem;
	}

	.post-upload a {
		color: #2563eb;
		text-decoration: none;
	}

	.post-upload a:hover {
		text-decoration: underline;
	}

	.job-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.job-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.job-label {
		width: 130px;
		color: #9ca3af;
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.job-bar-track {
		flex: 1;
		height: 6px;
		background: #1f2937;
		border-radius: 3px;
		overflow: hidden;
	}

	.job-bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s;
	}

	.job-bar-fill.pulsing {
		width: 60%;
		background: #3b82f6;
		animation: pulse-bar 1.5s ease-in-out infinite;
	}

	.job-bar-fill.full {
		width: 100%;
		background: #22c55e;
	}

	.job-status {
		width: 80px;
		text-align: right;
		font-size: 0.75rem;
		color: #6b7280;
	}

	@keyframes pulse-bar {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}
</style>
