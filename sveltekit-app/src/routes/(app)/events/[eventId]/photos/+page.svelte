<script lang="ts">
	import { page } from '$app/stores';
	import PhotoGrid from '$lib/components/PhotoGrid.svelte';
	import PhotoLightbox from '$lib/components/PhotoLightbox.svelte';

	let assetIds = $state<string[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let hasMore = $state(true);
	let eventName = $state('');
	let lightboxId = $state<string | null>(null);

	async function loadPhotos(pageNum: number) {
		loading = true;
		const res = await fetch(`/api/events/${$page.params.eventId}/photos?page=${pageNum}&size=50`);
		const data = await res.json();

		const items = data.assets?.items ?? [];
		const newIds = items.map((a: { id: string }) => a.id);

		if (pageNum === 1) {
			assetIds = newIds;
		} else {
			assetIds = [...assetIds, ...newIds];
		}

		hasMore = newIds.length === 50;
		loading = false;
	}

	$effect(() => {
		loadPhotos(1);
		fetch(`/api/events/${$page.params.eventId}`)
			.then((r) => r.json())
			.then((e) => (eventName = e.name));
	});

	function loadMore() {
		currentPage++;
		loadPhotos(currentPage);
	}

	let selectMode = $state(false);
	let selectedIds = $state<string[]>([]);
	let deleting = $state(false);

	function openLightbox(assetId: string) {
		if (selectMode) {
			toggleSelect(assetId);
			return;
		}
		lightboxId = assetId;
	}

	function closeLightbox() {
		lightboxId = null;
	}

	function prevPhoto() {
		if (!lightboxId) return;
		const idx = assetIds.indexOf(lightboxId);
		if (idx > 0) lightboxId = assetIds[idx - 1];
	}

	function nextPhoto() {
		if (!lightboxId) return;
		const idx = assetIds.indexOf(lightboxId);
		if (idx < assetIds.length - 1) lightboxId = assetIds[idx + 1];
	}

	function toggleSelect(assetId: string) {
		if (selectedIds.includes(assetId)) {
			selectedIds = selectedIds.filter((id) => id !== assetId);
		} else {
			selectedIds = [...selectedIds, assetId];
		}
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) selectedIds = [];
	}

	async function deleteSelected() {
		if (selectedIds.length === 0) return;
		if (!confirm(`Delete ${selectedIds.length} photo(s)? This cannot be undone.`)) return;

		deleting = true;
		const failed: string[] = [];

		for (const id of selectedIds) {
			const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
			if (!res.ok) failed.push(id);
		}

		assetIds = assetIds.filter((id) => !selectedIds.includes(id) || failed.includes(id));
		selectedIds = [];
		deleting = false;

		if (failed.length > 0) {
			alert(`Failed to delete ${failed.length} photo(s).`);
		}
	}

	async function deleteSingle(assetId: string) {
		const res = await fetch(`/api/photos/${assetId}`, { method: 'DELETE' });
		if (res.ok) {
			assetIds = assetIds.filter((id) => id !== assetId);
			// Move to next photo or close
			const idx = assetIds.indexOf(assetId);
			if (assetIds.length === 0) {
				lightboxId = null;
			} else if (idx < assetIds.length) {
				lightboxId = assetIds[idx];
			} else {
				lightboxId = assetIds[assetIds.length - 1];
			}
		} else {
			alert('Failed to delete photo.');
		}
	}

	let lightboxIdx = $derived(lightboxId ? assetIds.indexOf(lightboxId) : -1);
</script>

<div class="page-header">
	<a href="/events/{$page.params.eventId}" class="back">&larr; Back to event</a>
	<h1>{eventName ? `${eventName} - Photos` : 'Event Photos'}</h1>
	<div class="header-actions">
		<button class="select-btn" class:active={selectMode} onclick={toggleSelectMode}>
			{selectMode ? 'Cancel' : 'Select'}
		</button>
		{#if selectMode && selectedIds.length > 0}
			<button class="delete-btn" onclick={deleteSelected} disabled={deleting}>
				{deleting ? 'Deleting...' : `Delete (${selectedIds.length})`}
			</button>
		{/if}
		<a href="/events/{$page.params.eventId}/my-photos" class="find-me-btn">
			Find My Photos
		</a>
	</div>
</div>

{#if assetIds.length > 0}
	<PhotoGrid {assetIds} {selectedIds} onselect={openLightbox} selectable={selectMode} />

	{#if hasMore}
		<div class="load-more">
			<button onclick={loadMore} disabled={loading}>
				{loading ? 'Loading...' : 'Load More'}
			</button>
		</div>
	{/if}
{:else if !loading}
	<p class="empty">No photos have been uploaded for this event yet.</p>
{:else}
	<p class="loading">Loading photos...</p>
{/if}

<PhotoLightbox
	assetId={lightboxId}
	onclose={closeLightbox}
	onprev={prevPhoto}
	onnext={nextPhoto}
	ondelete={deleteSingle}
	hasPrev={lightboxIdx > 0}
	hasNext={lightboxIdx < assetIds.length - 1}
	canDelete={true}
/>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.back {
		color: #888;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.back:hover {
		color: #fff;
	}

	h1 {
		flex: 1;
		font-size: 1.5rem;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.select-btn {
		background: #222;
		color: #fff;
		border: 1px solid #333;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.select-btn:hover {
		background: #333;
	}

	.select-btn.active {
		background: #2563eb;
		border-color: #2563eb;
	}

	.delete-btn {
		background: #dc2626;
		color: #fff;
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.delete-btn:hover:not(:disabled) {
		background: #b91c1c;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.find-me-btn {
		background: linear-gradient(135deg, #2563eb, #7c3aed);
		color: #fff;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.load-more {
		text-align: center;
		padding: 2rem;
	}

	.load-more button {
		background: #222;
		color: #fff;
		border: 1px solid #333;
		padding: 0.6rem 2rem;
		border-radius: 8px;
		cursor: pointer;
	}

	.load-more button:hover:not(:disabled) {
		background: #333;
	}

	.empty,
	.loading {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}
</style>
