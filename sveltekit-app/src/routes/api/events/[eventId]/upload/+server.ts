import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getEventAlbumId, isPhotographer, isEventCreator } from '$lib/server/services/event.service.js';
import { uploadEventPhoto } from '$lib/server/services/photo.service.js';
import { checkRateLimit, getRateLimitKey } from '$lib/server/rate-limit.js';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// Rate limit: 100 uploads per minute per IP
	const rlKey = getRateLimitKey(request, 'upload');
	const rl = checkRateLimit(rlKey, 100, 60_000);
	if (!rl.allowed) {
		return json(
			{ error: 'Upload rate limit exceeded. Please wait before uploading more.' },
			{ status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
		);
	}

	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	// Verify photographer assignment OR event creator
	const [photographer, creator] = await Promise.all([
		isPhotographer(params.eventId, session.user.id),
		isEventCreator(params.eventId, session.user.id)
	]);
	if (!photographer && !creator) {
		return error(403, 'Not authorized to upload photos for this event');
	}

	// Get Immich album ID
	const albumId = await getEventAlbumId(params.eventId);
	if (!albumId) {
		return error(404, 'Event album not found. Immich may have been offline when the event was created.');
	}

	// Parse multipart form data
	const formData = await request.formData();
	const files = formData.getAll('photos') as File[];

	if (files.length === 0) {
		return error(400, 'No photos provided');
	}

	const results = [];
	const errors = [];

	for (const file of files) {
		try {
			const asset = await uploadEventPhoto(albumId, file);
			const status = asset.status === 'duplicate' ? 'duplicate' : 'success';
			results.push({ id: asset.id, filename: file.name, status });
		} catch (err) {
			errors.push({
				filename: file.name,
				status: 'error',
				message: err instanceof Error ? err.message : 'Upload failed'
			});
		}
	}

	return json({
		uploaded: results.length,
		failed: errors.length,
		results,
		errors
	});
};
