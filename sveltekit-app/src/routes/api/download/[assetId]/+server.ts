import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getPhotoOriginal } from '$lib/server/services/photo.service.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const result = await getPhotoOriginal(params.assetId, session.user.id);
		if (!result) {
			return error(403, 'Photo not purchased');
		}

		return new Response(result.stream, {
			headers: {
				'Content-Type': result.contentType,
				'Content-Disposition': `attachment; filename="${result.filename}"`
			}
		});
	} catch (err) {
		return error(500, err instanceof Error ? err.message : 'Download failed');
	}
};
