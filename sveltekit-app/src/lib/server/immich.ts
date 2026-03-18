import {
	init,
	createAlbum,
	addAssetsToAlbum,
	getAlbumInfo,
	searchAssets,
	getAllPeople,
	type AssetResponseDto,
	type AlbumResponseDto
} from '@immich/sdk';
import { IMMICH_API_URL, IMMICH_API_KEY, IMMICH_SERVICE_USER_ID } from './env.js';
import { immichPool } from './db/immich-readonly.js';

let initialized = false;

function ensureInit() {
	if (!initialized) {
		init({ baseUrl: IMMICH_API_URL, apiKey: IMMICH_API_KEY });
		initialized = true;
	}
}

export async function createEventAlbum(
	eventName: string,
	eventDate: string
): Promise<AlbumResponseDto> {
	ensureInit();
	return createAlbum({
		createAlbumDto: {
			albumName: `Event: ${eventName} (${eventDate})`
		}
	});
}

export async function getEventAlbum(albumId: string): Promise<AlbumResponseDto> {
	ensureInit();
	return getAlbumInfo({ id: albumId });
}

export async function addPhotosToAlbum(
	albumId: string,
	assetIds: string[]
) {
	ensureInit();
	return addAssetsToAlbum({
		id: albumId,
		bulkIdsDto: { ids: assetIds }
	});
}

export async function uploadPhoto(
	file: File,
	deviceAssetId: string
) {
	// Use raw fetch instead of SDK — more reliable with server-side File objects
	const now = new Date().toISOString();
	const formData = new FormData();
	formData.append('assetData', file);
	formData.append('deviceAssetId', deviceAssetId);
	formData.append('deviceId', 'sveltekit-app');
	formData.append('fileCreatedAt', now);
	formData.append('fileModifiedAt', now);

	const res = await fetch(`${IMMICH_API_URL}/assets`, {
		method: 'POST',
		headers: { 'x-api-key': IMMICH_API_KEY },
		body: formData
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Immich upload failed (${res.status}): ${body}`);
	}

	return res.json();
}

export async function getAlbumPhotos(
	albumId: string,
	page = 1,
	size = 50
): Promise<{ assets: { items: AssetResponseDto[] } }> {
	ensureInit();
	return searchAssets({
		metadataSearchDto: {
			albumIds: [albumId],
			page,
			size
		}
	});
}

export async function getPhotosByPerson(
	personId: string,
	albumId?: string
) {
	ensureInit();
	const dto: Record<string, unknown> = { personIds: [personId] };
	if (albumId) dto.albumIds = [albumId];
	return searchAssets({ metadataSearchDto: dto as never });
}

export async function getAssetThumbnail(
	assetId: string,
	size: 'thumbnail' | 'preview' = 'thumbnail'
): Promise<Response> {
	ensureInit();
	// Use raw fetch since viewAsset returns a blob, and we need the raw response
	const res = await fetch(`${IMMICH_API_URL}/assets/${assetId}/thumbnail?size=${size}`, {
		headers: { 'x-api-key': IMMICH_API_KEY }
	});
	return res;
}

export async function getAssetOriginal(assetId: string): Promise<Response> {
	ensureInit();
	const res = await fetch(`${IMMICH_API_URL}/assets/${assetId}/original`, {
		headers: { 'x-api-key': IMMICH_API_KEY }
	});
	return res;
}

export async function searchByText(
	albumId: string,
	query: string,
	mode: 'contains' | 'exact' | 'startsWith' | 'endsWith' = 'contains',
	page = 1,
	size = 200
): Promise<{ assetIds: string[]; scores: { assetId: string; score: number }[]; total: number }> {
	// Direct DB query with similarity scoring for all modes
	const serviceUserId = IMMICH_SERVICE_USER_ID;
	if (!serviceUserId) {
		throw new Error('IMMICH_SERVICE_USER_ID not configured');
	}

	const client = await immichPool.connect();
	try {
		let result;

		if (mode === 'contains') {
			// Hybrid: exact substring matches + fuzzy word_similarity matches, ranked by score
			const pattern = `%${query}%`;
			result = await client.query(
				`
				SELECT DISTINCT a.id AS "assetId",
					GREATEST(
						CASE WHEN os.text ILIKE $3 THEN 1.0 ELSE 0 END,
						word_similarity($4, os.text)
					) AS score
				FROM asset a
				INNER JOIN album_asset aa ON aa."assetId" = a.id
				INNER JOIN ocr_search os ON os."assetId" = a.id
				WHERE aa."albumId" = $1
					AND a."ownerId" = ANY($2::uuid[])
					AND a."deletedAt" IS NULL
					AND (os.text ILIKE $3 OR word_similarity($4, os.text) >= 0.3)
				ORDER BY score DESC, a.id
				LIMIT $5 OFFSET $6
				`,
				[albumId, [serviceUserId], pattern, query, size, (page - 1) * size]
			);
		} else {
			// Exact / startsWith / endsWith — deterministic match, score = 1.0
			let pattern: string;
			let operator: string;
			switch (mode) {
				case 'exact':
					pattern = query;
					operator = '=';
					break;
				case 'startsWith':
					pattern = `${query}%`;
					operator = 'ILIKE';
					break;
				case 'endsWith':
					pattern = `%${query}`;
					operator = 'ILIKE';
					break;
				default:
					pattern = `%${query}%`;
					operator = 'ILIKE';
			}

			result = await client.query(
				`
				SELECT DISTINCT a.id AS "assetId", 1.0 AS score
				FROM asset a
				INNER JOIN album_asset aa ON aa."assetId" = a.id
				INNER JOIN ocr_search os ON os."assetId" = a.id
				WHERE aa."albumId" = $1
					AND a."ownerId" = ANY($2::uuid[])
					AND a."deletedAt" IS NULL
					AND os.text ${operator} $3
				ORDER BY a.id
				LIMIT $4 OFFSET $5
				`,
				[albumId, [serviceUserId], pattern, size, (page - 1) * size]
			);
		}

		const rows = result.rows as { assetId: string; score: number }[];
		return {
			assetIds: rows.map((r) => r.assetId),
			scores: rows.map((r) => ({ assetId: r.assetId, score: Number(r.score) })),
			total: rows.length
		};
	} finally {
		client.release();
	}
}

export { getAllPeople };
