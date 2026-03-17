import { db } from '../db/index.js';
import { purchases, purchaseBundles, events } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { paymentService } from '../payment.js';

export async function createPurchaseIntent(
	userId: string,
	eventId: string,
	assetIds: string[]
) {
	// Get event pricing
	const [event] = await db.select().from(events).where(eq(events.id, eventId));
	if (!event) throw new Error('Event not found');

	// Check for already-purchased assets
	const existing = await db
		.select()
		.from(purchases)
		.where(
			and(
				eq(purchases.userId, userId),
				eq(purchases.status, 'completed'),
				inArray(purchases.assetId, assetIds)
			)
		);
	const alreadyPurchased = new Set(existing.map((p) => p.assetId));
	const newAssetIds = assetIds.filter((id) => !alreadyPurchased.has(id));

	if (newAssetIds.length === 0) {
		throw new Error('All selected photos have already been purchased');
	}

	// Calculate pricing: single = per-photo, multiple = bundle
	const perPhoto = event.pricingPerPhoto ?? 500;
	const bundlePrice = event.pricingBundle ?? 2000;
	const amountCents =
		newAssetIds.length === 1
			? perPhoto
			: Math.min(newAssetIds.length * perPhoto, bundlePrice);

	const intent = await paymentService.createPaymentIntent(amountCents, 'USD', {
		userId,
		eventId,
		assetIds: JSON.stringify(newAssetIds)
	});

	// Create purchase records (pending) — one per asset for easy lookup
	for (const assetId of newAssetIds) {
		await db.insert(purchases).values({
			userId,
			eventId,
			assetId,
			amountCents: newAssetIds.length === 1 ? amountCents : Math.round(amountCents / newAssetIds.length),
			paymentIntentId: intent.id,
			status: 'pending'
		});
	}

	// If bundle, also track the bundle
	if (newAssetIds.length > 1) {
		await db.insert(purchaseBundles).values({
			userId,
			eventId,
			assetIds: newAssetIds,
			amountCents,
			status: 'pending'
		});
	}

	return {
		...intent,
		assetCount: newAssetIds.length,
		skippedCount: alreadyPurchased.size
	};
}

export async function completePurchase(paymentIntentId: string) {
	await db
		.update(purchases)
		.set({ status: 'completed', completedAt: new Date() })
		.where(eq(purchases.paymentIntentId, paymentIntentId));
}

export async function getUserPurchases(userId: string, eventId?: string) {
	if (eventId) {
		return db
			.select()
			.from(purchases)
			.where(
				and(
					eq(purchases.userId, userId),
					eq(purchases.eventId, eventId),
					eq(purchases.status, 'completed')
				)
			);
	}
	return db
		.select()
		.from(purchases)
		.where(and(eq(purchases.userId, userId), eq(purchases.status, 'completed')));
}

export async function getPurchasedAssetIds(userId: string, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ assetId: purchases.assetId })
		.from(purchases)
		.where(
			and(
				eq(purchases.userId, userId),
				eq(purchases.eventId, eventId),
				eq(purchases.status, 'completed')
			)
		);
	return rows.map((r) => r.assetId);
}
