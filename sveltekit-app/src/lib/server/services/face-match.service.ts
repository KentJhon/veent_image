import {
	matchFaceInEvent,
	validateSelfie,
	checkMLHealth,
	type FaceMatchResult
} from '../face-match.js';
import { getEventAlbumId } from './event.service.js';
import { db } from '../db/index.js';
import { faceMatchSessions } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';

const DEFAULT_MAX_DISTANCE = 0.6;

export async function performFaceMatch(
	selfieBuffer: Buffer,
	eventId: string,
	userId?: string,
	maxDistance = DEFAULT_MAX_DISTANCE
): Promise<FaceMatchResult & { sessionId?: string }> {
	// Validate the selfie image
	const validation = await validateSelfie(selfieBuffer);
	if (!validation.valid) {
		return {
			matched: false,
			assets: [],
			personIds: [],
			facesDetected: 0,
			error: validation.error
		};
	}

	// Check ML service availability
	const mlHealthy = await checkMLHealth();
	if (!mlHealthy) {
		return {
			matched: false,
			assets: [],
			personIds: [],
			facesDetected: 0,
			error: 'Face recognition service is temporarily unavailable. Please try again in a moment.'
		};
	}

	// Get the Immich album ID for this event
	const albumId = await getEventAlbumId(eventId);
	if (!albumId) {
		return {
			matched: false,
			assets: [],
			personIds: [],
			facesDetected: 0,
			error: 'Event has no photo album'
		};
	}

	// Perform face matching
	const result = await matchFaceInEvent(selfieBuffer, albumId, maxDistance);

	// Cache the session if user is authenticated and matches were found
	let sessionId: string | undefined;
	if (userId && result.matched) {
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 24);

		const [session] = await db
			.insert(faceMatchSessions)
			.values({
				userId,
				eventId,
				matchedAssetIds: result.assets.map((a) => a.assetId),
				matchedPersonIds: result.personIds,
				expiresAt
			})
			.returning();

		sessionId = session.id;
	}

	return { ...result, sessionId };
}

/**
 * Retrieve a cached face match session.
 * Returns null if expired or not found.
 */
export async function getFaceMatchSession(
	sessionId: string,
	userId: string
): Promise<{
	id: string;
	eventId: string;
	matchedAssetIds: string[];
	matchedPersonIds: string[];
	createdAt: Date | null;
} | null> {
	const [session] = await db
		.select()
		.from(faceMatchSessions)
		.where(
			and(
				eq(faceMatchSessions.id, sessionId),
				eq(faceMatchSessions.userId, userId),
				gt(faceMatchSessions.expiresAt, new Date())
			)
		);

	if (!session) return null;

	return {
		id: session.id,
		eventId: session.eventId,
		matchedAssetIds: (session.matchedAssetIds ?? []) as string[],
		matchedPersonIds: (session.matchedPersonIds ?? []) as string[],
		createdAt: session.createdAt
	};
}

/**
 * Get the most recent face match session for a user + event.
 */
export async function getLatestFaceMatchSession(
	userId: string,
	eventId: string
): Promise<{
	id: string;
	matchedAssetIds: string[];
	matchedPersonIds: string[];
	createdAt: Date | null;
} | null> {
	const [session] = await db
		.select()
		.from(faceMatchSessions)
		.where(
			and(
				eq(faceMatchSessions.userId, userId),
				eq(faceMatchSessions.eventId, eventId),
				gt(faceMatchSessions.expiresAt, new Date())
			)
		)
		.orderBy(faceMatchSessions.createdAt)
		.limit(1);

	if (!session) return null;

	return {
		id: session.id,
		matchedAssetIds: (session.matchedAssetIds ?? []) as string[],
		matchedPersonIds: (session.matchedPersonIds ?? []) as string[],
		createdAt: session.createdAt
	};
}
