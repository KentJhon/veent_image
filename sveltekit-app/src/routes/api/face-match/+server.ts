import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
	performFaceMatch,
	getFaceMatchSession,
	getLatestFaceMatchSession
} from '$lib/server/services/face-match.service.js';
import { checkRateLimit, getRateLimitKey } from '$lib/server/rate-limit.js';

/**
 * GET /api/face-match?sessionId=...  — Retrieve cached face match session
 * GET /api/face-match?eventId=...    — Get latest session for event
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Sign in to access face match sessions');
	}

	const sessionId = url.searchParams.get('sessionId');
	const eventId = url.searchParams.get('eventId');

	if (sessionId) {
		const cached = await getFaceMatchSession(sessionId, session.user.id);
		if (!cached) {
			return json({ found: false, error: 'Session expired or not found' });
		}
		return json({
			found: true,
			matched: true,
			totalMatches: cached.matchedAssetIds.length,
			assetIds: cached.matchedAssetIds,
			personIds: cached.matchedPersonIds,
			sessionId: cached.id,
			createdAt: cached.createdAt
		});
	}

	if (eventId) {
		const latest = await getLatestFaceMatchSession(session.user.id, eventId);
		if (!latest) {
			return json({ found: false });
		}
		return json({
			found: true,
			matched: true,
			totalMatches: latest.matchedAssetIds.length,
			assetIds: latest.matchedAssetIds,
			personIds: latest.matchedPersonIds,
			sessionId: latest.id,
			createdAt: latest.createdAt
		});
	}

	return error(400, 'sessionId or eventId query parameter is required');
};

/**
 * POST /api/face-match — Submit selfie for face matching
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Rate limit: 10 face matches per minute per IP
	const rlKey = getRateLimitKey(request, 'face-match');
	const rl = checkRateLimit(rlKey, 10, 60_000);
	if (!rl.allowed) {
		return json(
			{ error: 'Too many requests. Please wait a moment before trying again.' },
			{ status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
		);
	}

	const session = await locals.auth();

	const formData = await request.formData();
	const selfie = formData.get('selfie') as File | null;
	const eventId = formData.get('eventId') as string | null;
	const threshold = formData.get('threshold') as string | null;

	if (!selfie || !eventId) {
		return error(400, 'selfie (file) and eventId are required');
	}

	if (selfie.size > 10 * 1024 * 1024) {
		return error(400, 'Selfie must be under 10MB');
	}

	const maxDistance = threshold ? Math.min(Math.max(parseFloat(threshold), 0.3), 0.8) : 0.6;
	const selfieBuffer = Buffer.from(await selfie.arrayBuffer());

	try {
		const result = await performFaceMatch(
			selfieBuffer,
			eventId,
			session?.user?.id ?? undefined,
			maxDistance
		);

		return json({
			matched: result.matched,
			totalMatches: result.assets.length,
			assetIds: result.assets.map((a) => a.assetId),
			distances: result.assets.map((a) => ({
				assetId: a.assetId,
				distance: Math.round(a.distance * 1000) / 1000
			})),
			personIds: result.personIds,
			facesDetected: result.facesDetected,
			sessionId: result.sessionId,
			error: result.error
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Face matching failed';

		if (message.includes('No face detected') || message.includes('too small') || message.includes('Unsupported')) {
			return json({
				matched: false,
				totalMatches: 0,
				assetIds: [],
				distances: [],
				personIds: [],
				facesDetected: 0,
				error: message
			});
		}

		if (message.includes('AbortError') || message.includes('timeout')) {
			return json({
				matched: false,
				totalMatches: 0,
				assetIds: [],
				distances: [],
				personIds: [],
				facesDetected: 0,
				error: 'Face analysis timed out. Please try with a smaller or clearer photo.'
			});
		}

		return error(500, message);
	}
};
