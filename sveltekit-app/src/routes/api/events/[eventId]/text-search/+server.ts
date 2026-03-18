import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getEventAlbumId } from '$lib/server/services/event.service.js';
import { searchByText } from '$lib/server/immich.js';
import { checkRateLimit, getRateLimitKey } from '$lib/server/rate-limit.js';

const VALID_MODES = ['contains', 'exact', 'startsWith', 'endsWith'] as const;
type SearchMode = (typeof VALID_MODES)[number];

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// Rate limit: 30 text searches per minute per IP
	const rlKey = getRateLimitKey(request, 'text-search');
	const rl = checkRateLimit(rlKey, 30, 60_000);
	if (!rl.allowed) {
		return json(
			{ error: 'Search rate limit exceeded. Please wait before searching again.' },
			{ status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
		);
	}

	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Sign in to search photos');
	}

	let body: { query?: string; mode?: string };
	try {
		body = await request.json();
	} catch {
		return error(400, 'Invalid JSON body');
	}

	const query = body.query?.trim();
	if (!query) {
		return error(400, 'query is required');
	}

	if (query.length > 200) {
		return error(400, 'query must be 200 characters or fewer');
	}

	const mode: SearchMode = VALID_MODES.includes(body.mode as SearchMode)
		? (body.mode as SearchMode)
		: 'contains';

	const albumId = await getEventAlbumId(params.eventId);
	if (!albumId) {
		return error(404, 'Event album not found');
	}

	try {
		const result = await searchByText(albumId, query, mode);
		return json({
			matched: result.assetIds.length > 0,
			totalMatches: result.total,
			assetIds: result.assetIds
		});
	} catch (err) {
		console.error('[text-search] Error:', err);
		return error(500, 'Text search failed');
	}
};
