import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { events, eventAlbums, users, purchases, purchaseBundles, photographerAssignments, faceMatchSessions } from '$lib/server/db/schema.js';
import { eq, count, sql } from 'drizzle-orm';
import { checkMLHealth } from '$lib/server/face-match.js';
import { getWatermarkCacheStats } from '$lib/server/watermark.js';
import { IMMICH_API_URL, IMMICH_API_KEY } from '$lib/server/env.js';

export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const now = Date.now();

	// ── App database stats ──────────────────────────
	const [eventCount] = await db.select({ count: count() }).from(events);
	const [userCount] = await db.select({ count: count() }).from(users);
	const [albumCount] = await db.select({ count: count() }).from(eventAlbums);
	const [purchaseCount] = await db.select({ count: count() }).from(purchases).where(eq(purchases.status, 'completed'));
	const [pendingPurchases] = await db.select({ count: count() }).from(purchases).where(eq(purchases.status, 'pending'));
	const [photographerCount] = await db.select({ count: count() }).from(photographerAssignments);
	const [matchSessionCount] = await db.select({ count: count() }).from(faceMatchSessions);

	// Revenue
	const [revenue] = await db
		.select({ total: sql<number>`COALESCE(SUM(${purchases.amountCents}), 0)` })
		.from(purchases)
		.where(eq(purchases.status, 'completed'));

	// ── Immich stats ────────────────────────────────
	let immich = { status: 'unreachable' as string, version: '', assets: 0, albums: 0, people: 0, latencyMs: 0 };
	const immichStart = Date.now();
	try {
		const aboutRes = await fetch(`${IMMICH_API_URL}/server/about`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});
		if (aboutRes.ok) {
			const about = await aboutRes.json();
			immich.status = 'healthy';
			immich.version = about.version ?? '';
		}
		immich.latencyMs = Date.now() - immichStart;

		// Get asset statistics
		const statsRes = await fetch(`${IMMICH_API_URL}/assets/statistics`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});
		if (statsRes.ok) {
			const stats = await statsRes.json();
			immich.assets = (stats.images ?? 0) + (stats.videos ?? 0);
		}

		// Get album count from Immich
		const albumsRes = await fetch(`${IMMICH_API_URL}/albums`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});
		if (albumsRes.ok) {
			const albums = await albumsRes.json();
			immich.albums = albums.length;
		}

		// Get people count
		const peopleRes = await fetch(`${IMMICH_API_URL}/people?size=1`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});
		if (peopleRes.ok) {
			const people = await peopleRes.json();
			immich.people = people.total ?? people.people?.length ?? 0;
		}
	} catch {
		immich.status = 'unreachable';
		immich.latencyMs = Date.now() - immichStart;
	}

	// ── ML service ──────────────────────────────────
	const mlStart = Date.now();
	const mlHealthy = await checkMLHealth();
	const ml = { status: mlHealthy ? 'healthy' : 'unreachable', latencyMs: Date.now() - mlStart };

	// ── Watermark cache ─────────────────────────────
	const watermarkCache = getWatermarkCacheStats();

	return json({
		timestamp: new Date().toISOString(),
		app: {
			events: eventCount.count,
			eventsWithAlbum: albumCount.count,
			users: userCount.count,
			photographers: photographerCount.count,
			completedPurchases: purchaseCount.count,
			pendingPurchases: pendingPurchases.count,
			faceMatchSessions: matchSessionCount.count,
			revenueCents: revenue.total
		},
		immich,
		ml,
		watermarkCache
	});
};
