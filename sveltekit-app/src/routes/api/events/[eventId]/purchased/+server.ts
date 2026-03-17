import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getPurchasedAssetIds } from '$lib/server/services/purchase.service.js';

/**
 * GET /api/events/[eventId]/purchased — Get list of purchased asset IDs for current user
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return json({ assetIds: [] });
	}

	const assetIds = await getPurchasedAssetIds(session.user.id, params.eventId);
	return json({ assetIds });
};
