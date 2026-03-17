import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import sharp from 'sharp';
import { applyWatermark } from '$lib/server/watermark.js';
import { WATERMARK_BRAND_NAME, WATERMARK_OPACITY } from '$lib/server/env.js';

/**
 * Generates a watermark preview using a solid-color test image.
 * Useful for testing watermark appearance without needing Immich.
 *
 * Query params:
 *   ?width=800&height=600  — test image dimensions
 *   ?brand=MyBrand         — override brand name
 *   ?opacity=0.3           — override opacity
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const width = Math.min(parseInt(url.searchParams.get('width') ?? '800'), 2000);
	const height = Math.min(parseInt(url.searchParams.get('height') ?? '600'), 2000);
	const brand = url.searchParams.get('brand') ?? WATERMARK_BRAND_NAME;
	const opacity = parseFloat(url.searchParams.get('opacity') ?? String(WATERMARK_OPACITY));

	// Generate a gradient test image
	const testImage = await sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 60, g: 80, b: 120 }
		}
	})
		.jpeg({ quality: 90 })
		.toBuffer();

	const watermarked = await applyWatermark(testImage, brand, opacity);

	return new Response(new Uint8Array(watermarked), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-store'
		}
	});
};
