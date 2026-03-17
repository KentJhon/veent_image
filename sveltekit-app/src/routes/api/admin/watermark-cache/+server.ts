import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { clearWatermarkCache, getWatermarkCacheStats } from '$lib/server/watermark.js';

export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const stats = getWatermarkCacheStats();
	return json(stats);
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const result = clearWatermarkCache();
	return json(result);
};
