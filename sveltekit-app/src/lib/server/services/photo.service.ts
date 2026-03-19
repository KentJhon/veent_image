import { getAlbumPhotos, getAssetThumbnail, getAssetOriginal, addPhotosToAlbum, uploadPhoto, deletePhotos } from '../immich.js';
import { getWatermarkedImage, clearWatermarkCacheForAsset } from '../watermark.js';
import { WATERMARK_BRAND_NAME } from '../env.js';
import { s3Enabled, uploadToS3, getFromS3, uploadThumbnailToS3, getThumbnailFromS3, deleteFromS3 } from '../s3.js';
import { db } from '../db/index.js';
import { purchases, purchaseBundles, faceMatchSessions } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

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

	// Fire-and-forget S3 upload (Immich is source of truth; S3 is for fast original downloads)
	if (s3Enabled) {
		uploadToS3(asset.id, file.name, Buffer.from(buffer), file.type)
			.catch((err) => console.error(`[S3] Upload failed for asset ${asset.id}:`, err));
	}

	return asset;
}

export async function getPhotoThumbnail(
	assetId: string,
	userId: string | null,
	size: 'thumbnail' | 'preview' = 'thumbnail'
): Promise<{ buffer: Buffer; contentType: string }> {
	// Check if user has purchased this photo
	const purchased = userId ? await hasPurchased(userId, assetId) : false;

	// Fetch raw image: S3 first, Immich fallback (lazy-cache to S3)
	let buffer: Buffer;
	let contentType: string;

	if (s3Enabled) {
		const s3Result = await getThumbnailFromS3(assetId, size);
		if (s3Result) {
			buffer = s3Result.buffer;
			contentType = s3Result.contentType;
		} else {
			// Not in S3 yet — fetch from Immich and cache to S3
			const res = await getAssetThumbnail(assetId, size);
			if (!res.ok) throw new Error(`Failed to fetch thumbnail: ${res.status}`);
			buffer = Buffer.from(await res.arrayBuffer());
			contentType = res.headers.get('content-type') ?? 'image/jpeg';
			// Cache to S3 for next time (fire-and-forget)
			uploadThumbnailToS3(assetId, size, buffer, contentType)
				.catch((err) => console.error(`[S3] Thumbnail cache failed for ${assetId}:`, err));
		}
	} else {
		const res = await getAssetThumbnail(assetId, size);
		if (!res.ok) throw new Error(`Failed to fetch thumbnail: ${res.status}`);
		buffer = Buffer.from(await res.arrayBuffer());
		contentType = res.headers.get('content-type') ?? 'image/jpeg';
	}

	// Validate we got actual image data
	if (buffer.length === 0) {
		throw new Error('Empty image received');
	}

	// Purchased users get the clean image directly
	if (purchased) {
		return { buffer, contentType };
	}

	// Apply watermark for unpurchased users
	try {
		const watermarked = await getWatermarkedImage(assetId, size, buffer, WATERMARK_BRAND_NAME);
		return { buffer: watermarked, contentType: 'image/jpeg' };
	} catch (err) {
		console.error(`Watermark failed for asset ${assetId}:`, err);
		return { buffer, contentType };
	}
}

export async function getPhotoOriginal(
	assetId: string,
	userId: string
): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null> {
	// Verify purchase — originals are never served without payment
	const purchased = await hasPurchased(userId, assetId);
	if (!purchased) return null;

	// Try S3 first (faster), fall back to Immich (legacy photos / S3 disabled)
	if (s3Enabled) {
		const s3Result = await getFromS3(assetId);
		if (s3Result) return s3Result;
	}

	const res = await getAssetOriginal(assetId);
	if (!res.ok || !res.body) {
		throw new Error(`Failed to fetch original: ${res.status}`);
	}

	const contentType = res.headers.get('content-type') ?? 'image/jpeg';
	const disposition = res.headers.get('content-disposition');
	const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `photo-${assetId}.jpg`;

	return { stream: res.body, contentType, filename };
}

export async function deleteEventPhotos(assetIds: string[]): Promise<void> {
	// 1. Delete from Immich (source of truth)
	await deletePhotos(assetIds);

	// 2. Clean up S3 copies (fire-and-forget)
	if (s3Enabled) {
		Promise.allSettled(assetIds.map((id) => deleteFromS3(id)))
			.catch((err) => console.error('[S3] Bulk delete failed:', err));
	}

	// 3. Clean up watermark cache
	for (const id of assetIds) {
		clearWatermarkCacheForAsset(id);
	}

	// 4. Remove related purchase records
	for (const assetId of assetIds) {
		await db.delete(purchases).where(eq(purchases.assetId, assetId));
	}

	// 5. Remove deleted asset IDs from face match sessions
	for (const assetId of assetIds) {
		await db.execute(sql`
			UPDATE face_match_sessions
			SET matched_asset_ids = array_remove(matched_asset_ids, ${assetId})
			WHERE ${assetId} = ANY(matched_asset_ids)
		`);
	}
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
