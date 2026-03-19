<script lang="ts">
	interface Props {
		assetId: string | null;
		onclose: () => void;
		onprev?: () => void;
		onnext?: () => void;
		ondelete?: (assetId: string) => void;
		hasPrev?: boolean;
		hasNext?: boolean;
		canDelete?: boolean;
	}

	let { assetId, onclose, onprev, onnext, ondelete, hasPrev = false, hasNext = false, canDelete = false }: Props = $props();

	let deleting = $state(false);

	async function handleDelete() {
		if (!assetId || !ondelete) return;
		if (!confirm('Delete this photo? This cannot be undone.')) return;
		deleting = true;
		ondelete(assetId);
		deleting = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		if (e.key === 'ArrowLeft' && hasPrev) onprev?.();
		if (e.key === 'ArrowRight' && hasNext) onnext?.();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if assetId}
	<div class="lightbox-overlay" onclick={onclose} onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} role="button" tabindex="-1">
		<div class="lightbox-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-label="Photo preview" tabindex="-1">
			{#if hasPrev}
				<button class="nav-btn nav-prev" onclick={onprev} aria-label="Previous photo">
					&#8249;
				</button>
			{/if}

			<img
				src="/api/photos/{assetId}?size=preview"
				alt=""
				class="lightbox-img"
			/>

			{#if hasNext}
				<button class="nav-btn nav-next" onclick={onnext} aria-label="Next photo">
					&#8250;
				</button>
			{/if}

			<button class="close-btn" onclick={onclose} aria-label="Close">
				&times;
			</button>

			{#if canDelete && ondelete}
				<button class="delete-btn" onclick={handleDelete} disabled={deleting} aria-label="Delete photo">
					{deleting ? 'Deleting...' : 'Delete'}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.lightbox-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.92);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lightbox-content {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		align-items: center;
	}

	.lightbox-img {
		max-width: 90vw;
		max-height: 85vh;
		object-fit: contain;
		border-radius: 4px;
	}

	.close-btn {
		position: absolute;
		top: -40px;
		right: 0;
		background: none;
		border: none;
		color: #aaa;
		font-size: 2rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		line-height: 1;
	}

	.close-btn:hover {
		color: #fff;
	}

	.nav-btn {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.1);
		border: none;
		color: #fff;
		font-size: 2.5rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		border-radius: 8px;
		line-height: 1;
		z-index: 10;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.nav-prev {
		left: -60px;
	}

	.nav-next {
		right: -60px;
	}

	.delete-btn {
		position: absolute;
		bottom: -40px;
		right: 0;
		background: #dc2626;
		border: none;
		color: #fff;
		font-size: 0.85rem;
		padding: 0.4rem 1rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.delete-btn:hover:not(:disabled) {
		background: #b91c1c;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.nav-prev {
			left: 8px;
		}

		.nav-next {
			right: 8px;
		}
	}
</style>
