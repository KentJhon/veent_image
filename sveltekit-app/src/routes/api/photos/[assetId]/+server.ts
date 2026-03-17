import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getPhotoThumbnail } from '$lib/server/services/photo.service.js';
import { createHash } from 'crypto';

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
	const session = await locals.auth();
	const size = (url.searchParams.get('size') ?? 'thumbnail') as 'thumbnail' | 'preview';

	if (size !== 'thumbnail' && size !== 'preview') {
		return error(400, 'size must be "thumbnail" or "preview"');
	}

	try {
		const { buffer, contentType } = await getPhotoThumbnail(
			params.assetId,
			session?.user?.id ?? null,
			size
		);

		// Generate ETag for cache validation
		const etag = `"${createHash('md5').update(buffer).digest('hex')}"`;

		// Return 304 if client has current version
		const ifNoneMatch = request.headers.get('if-none-match');
		if (ifNoneMatch === etag) {
			return new Response(null, { status: 304 });
		}

		return new Response(new Uint8Array(buffer), {
			headers: {
				'Content-Type': contentType,
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				'ETag': etag
			}
		});
	} catch (err) {
		return error(500, err instanceof Error ? err.message : 'Failed to load photo');
	}
};
