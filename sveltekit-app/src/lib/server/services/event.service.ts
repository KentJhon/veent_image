import { db } from '../db/index.js';
import { events, eventAlbums, photographerAssignments, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createEventAlbum as createImmichAlbum } from '../immich.js';

export async function createEvent(data: {
	name: string;
	description?: string;
	date: Date;
	venue?: string;
	pricingPerPhoto?: number;
	pricingBundle?: number;
	createdBy: string;
}) {
	// 1. Create event in app database
	const [event] = await db
		.insert(events)
		.values({
			name: data.name,
			description: data.description ?? null,
			date: data.date,
			venue: data.venue ?? null,
			pricingPerPhoto: data.pricingPerPhoto ?? 500,
			pricingBundle: data.pricingBundle ?? 2000,
			createdBy: data.createdBy
		})
		.returning();

	// 2. Try to create corresponding album in Immich
	let albumId: string | null = null;
	try {
		const dateStr = data.date.toISOString().split('T')[0];
		const album = await createImmichAlbum(data.name, dateStr);
		albumId = album.id;

		// 3. Store the mapping
		await db.insert(eventAlbums).values({
			eventId: event.id,
			immichAlbumId: album.id
		});
	} catch (err) {
		// Immich unavailable — event is created but album will need to be provisioned later
		console.warn(
			`Failed to create Immich album for event "${data.name}":`,
			err instanceof Error ? err.message : err
		);
	}

	return { event, albumId, immichConnected: albumId !== null };
}

/**
 * Retry album provisioning for events that were created while Immich was unavailable.
 */
export async function provisionAlbumForEvent(eventId: string): Promise<string | null> {
	const [event] = await db.select().from(events).where(eq(events.id, eventId));
	if (!event) return null;

	// Check if album already exists
	const [existing] = await db.select().from(eventAlbums).where(eq(eventAlbums.eventId, eventId));
	if (existing) return existing.immichAlbumId;

	// Try to create it now
	const dateStr = event.date.toISOString().split('T')[0];
	const album = await createImmichAlbum(event.name, dateStr);

	await db.insert(eventAlbums).values({
		eventId: event.id,
		immichAlbumId: album.id
	});

	return album.id;
}

export async function getEvents() {
	return db.select().from(events).orderBy(events.date);
}

export async function getEventById(id: string) {
	const [event] = await db.select().from(events).where(eq(events.id, id));
	if (!event) return null;

	const [albumMapping] = await db
		.select()
		.from(eventAlbums)
		.where(eq(eventAlbums.eventId, id));

	return { ...event, immichAlbumId: albumMapping?.immichAlbumId ?? null };
}

export async function getEventAlbumId(eventId: string): Promise<string | null> {
	const [mapping] = await db
		.select()
		.from(eventAlbums)
		.where(eq(eventAlbums.eventId, eventId));
	return mapping?.immichAlbumId ?? null;
}

export async function assignPhotographer(eventId: string, userId: string, role = 'photographer') {
	return db.insert(photographerAssignments).values({ userId, eventId, role }).returning();
}

export async function isPhotographer(eventId: string, userId: string): Promise<boolean> {
	const [assignment] = await db
		.select()
		.from(photographerAssignments)
		.where(
			and(
				eq(photographerAssignments.eventId, eventId),
				eq(photographerAssignments.userId, userId)
			)
		);

	return !!assignment;
}

export async function getEventPhotographers(eventId: string) {
	return db
		.select({
			assignmentId: photographerAssignments.id,
			userId: photographerAssignments.userId,
			role: photographerAssignments.role,
			userName: users.name,
			userEmail: users.email
		})
		.from(photographerAssignments)
		.innerJoin(users, eq(users.id, photographerAssignments.userId))
		.where(eq(photographerAssignments.eventId, eventId));
}

export async function removePhotographer(assignmentId: string) {
	return db
		.delete(photographerAssignments)
		.where(eq(photographerAssignments.id, assignmentId));
}

export async function updateEvent(
	id: string,
	data: Partial<{
		name: string;
		description: string | null;
		date: Date;
		venue: string | null;
		pricingPerPhoto: number;
		pricingBundle: number;
	}>
) {
	const [updated] = await db
		.update(events)
		.set(data)
		.where(eq(events.id, id))
		.returning();
	return updated;
}

export async function deleteEvent(id: string) {
	await db.delete(eventAlbums).where(eq(eventAlbums.eventId, id));
	await db.delete(photographerAssignments).where(eq(photographerAssignments.eventId, id));
	await db.delete(events).where(eq(events.id, id));
}

export async function isEventCreator(eventId: string, userId: string): Promise<boolean> {
	const [event] = await db
		.select()
		.from(events)
		.where(eq(events.id, eventId));
	return event?.createdBy === userId;
}
