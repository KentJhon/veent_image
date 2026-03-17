import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getEventAlbumId } from '$lib/server/services/event.service.js';
import { listEventPhotos } from '$lib/server/services/photo.service.js';

export const GET: RequestHandler = async ({ params, url }) => {
	const albumId = await getEventAlbumId(params.eventId);
	if (!albumId) {
		return error(404, 'Event album not found');
	}

	const page = parseInt(url.searchParams.get('page') ?? '1');
	const size = Math.min(parseInt(url.searchParams.get('size') ?? '50'), 100);

	const result = await listEventPhotos(albumId, page, size);
	return json(result);
};
