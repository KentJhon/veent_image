import { getAlbumPhotos, getAssetThumbnail, getAssetOriginal, addPhotosToAlbum, uploadPhoto } from '../immich.js';
import { getWatermarkedImage } from '../watermark.js';
import { WATERMARK_BRAND_NAME } from '../env.js';
import { db } from '../db/index.js';
import { purchases } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export async function listEventPhotos(albumId: string, page = 1, size = 50) {
	const result = await getAlbumPhotos(albumId, page, size);
	return result;
}

export async function uploadEventPhoto(albumId: string, file: File) {
	// Use content hash as deviceAssetId so Immich deduplicates identical files
	const buffer = await file.arrayBuffer();
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashHex = Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const deviceAssetId = `eventsnap-${hashHex}`;

	// Re-create the File from the buffer since we consumed the arrayBuffer
	const newFile = new File([buffer], file.name, { type: file.type });
	const asset = await uploadPhoto(newFile, deviceAssetId);

	// asset.status is "duplicate" if already uploaded — still add to album (idempotent)
	await addPhotosToAlbum(albumId, [asset.id]);
	return asset;
}

export async function getPhotoThumbnail(
	assetId: string,
	userId: string | null,
	size: 'thumbnail' | 'preview' = 'thumbnail'
): Promise<{ buffer: Buffer; contentType: string }> {
	// Check if user has purchased this photo
	const purchased = userId ? await hasPurchased(userId, assetId) : false;

	// Fetch from Immich
	const res = await getAssetThumbnail(assetId, size);
	if (!res.ok) {
		throw new Error(`Failed to fetch thumbnail: ${res.status}`);
	}

	const buffer = Buffer.from(await res.arrayBuffer());

	// Validate we got actual image data
	if (buffer.length === 0) {
		throw new Error('Empty image received from Immich');
	}

	// Purchased users get the clean image directly
	if (purchased) {
		return { buffer, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
	}

	// Apply watermark for unpurchased users
	try {
		const watermarked = await getWatermarkedImage(assetId, size, buffer, WATERMARK_BRAND_NAME);
		return { buffer: watermarked, contentType: 'image/jpeg' };
	} catch (err) {
		// If watermarking fails (corrupt image, etc.), still return the image
		// but log the error. In production this should be monitored.
		console.error(`Watermark failed for asset ${assetId}:`, err);
		return { buffer, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
	}
}

export async function getPhotoOriginal(
	assetId: string,
	userId: string
): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null> {
	// Verify purchase — originals are never served without payment
	const purchased = await hasPurchased(userId, assetId);
	if (!purchased) return null;

	const res = await getAssetOriginal(assetId);
	if (!res.ok || !res.body) {
		throw new Error(`Failed to fetch original: ${res.status}`);
	}

	const contentType = res.headers.get('content-type') ?? 'image/jpeg';
	const disposition = res.headers.get('content-disposition');
	const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `photo-${assetId}.jpg`;

	return { stream: res.body, contentType, filename };
}

export async function hasPurchased(userId: string, assetId: string): Promise<boolean> {
	const [purchase] = await db
		.select()
		.from(purchases)
		.where(
			and(
				eq(purchases.userId, userId),
				eq(purchases.assetId, assetId),
				eq(purchases.status, 'completed')
			)
		);
	return !!purchase;
}
