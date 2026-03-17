<script lang="ts">
	interface Purchase {
		id: string;
		eventId: string;
		assetId: string;
		amountCents: number;
		currency: string | null;
		status: string | null;
		createdAt: string;
		completedAt: string | null;
	}

	let purchases = $state<Purchase[]>([]);
	let loading = $state(true);

	$effect(() => {
		fetch('/api/purchases')
			.then((r) => r.json())
			.then((data) => {
				purchases = data;
				loading = false;
			})
			.catch(() => {
				loading = false;
			});
	});
</script>

<h1>My Purchases</h1>

{#if loading}
	<p class="loading">Loading purchases...</p>
{:else if purchases.length === 0}
	<div class="empty">
		<p>You haven't purchased any photos yet.</p>
		<a href="/events">Browse events to find your photos</a>
	</div>
{:else}
	<div class="purchases-list">
		{#each purchases as purchase}
			<div class="purchase-item">
				<div class="purchase-photo">
					<img src="/api/photos/{purchase.assetId}?size=thumbnail" alt="" />
				</div>
				<div class="purchase-info">
					<div class="purchase-price">
						${((purchase.amountCents) / 100).toFixed(2)} {purchase.currency ?? 'USD'}
					</div>
					<div class="purchase-date">
						{new Date(purchase.completedAt ?? purchase.createdAt).toLocaleDateString()}
					</div>
					<span class="purchase-status" class:completed={purchase.status === 'completed'}>
						{purchase.status}
					</span>
				</div>
				<div class="purchase-actions">
					{#if purchase.status === 'completed'}
						<a href="/api/download/{purchase.assetId}" class="download-btn" download>
							Download
						</a>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	h1 {
		font-size: 1.8rem;
		margin-bottom: 2rem;
	}

	.loading {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}

	.empty {
		text-align: center;
		padding: 4rem 0;
		color: #888;
	}

	.empty a {
		color: #2563eb;
		text-decoration: none;
		display: inline-block;
		margin-top: 1rem;
	}

	.purchases-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.purchase-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: #151515;
		border: 1px solid #222;
		border-radius: 10px;
		padding: 0.75rem;
	}

	.purchase-photo {
		width: 80px;
		height: 80px;
		border-radius: 8px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.purchase-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.purchase-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.purchase-price {
		font-weight: 600;
		color: #fff;
	}

	.purchase-date {
		color: #888;
		font-size: 0.8rem;
	}

	.purchase-status {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		color: #eab308;
		width: fit-content;
	}

	.purchase-status.completed {
		color: #22c55e;
	}

	.download-btn {
		background: #2563eb;
		color: #fff;
		padding: 0.45rem 1rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.download-btn:hover {
		background: #1d4ed8;
	}
</style>
