<script lang="ts">
	interface Props {
		assetIds: string[];
		selectedIds?: string[];
		onselect?: (assetId: string) => void;
		selectable?: boolean;
	}

	let { assetIds, selectedIds = [], onselect, selectable = false }: Props = $props();
</script>

<div class="photo-grid">
	{#each assetIds as assetId}
		<button
			class="photo-item"
			class:selected={selectedIds.includes(assetId)}
			class:selectable
			onclick={() => onselect?.(assetId)}
			type="button"
		>
			<img
				src="/api/photos/{assetId}?size=thumbnail"
				alt=""
				loading="lazy"
			/>
			{#if selectable && selectedIds.includes(assetId)}
				<div class="check-badge">&#10003;</div>
			{/if}
		</button>
	{/each}
</div>

<style>
	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.photo-item {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 8px;
		border: 2px solid transparent;
		background: #111;
		padding: 0;
		cursor: pointer;
		transition: transform 0.15s, border-color 0.15s;
	}

	.photo-item:hover {
		transform: scale(1.02);
	}

	.photo-item.selectable:hover {
		border-color: #333;
	}

	.photo-item.selected {
		border-color: #2563eb;
	}

	.photo-item img {
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
</style>
