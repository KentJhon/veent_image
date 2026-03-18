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
): Promise<{ assetIds: string[]; total: number }> {
	// For "contains" mode, try the Immich SDK's OCR search first
	if (mode === 'contains') {
		ensureInit();
		try {
			const result = await searchAssets({
				metadataSearchDto: {
					ocr: query,
					albumIds: [albumId],
					page,
					size
				}
			});

			const items = (result as { assets?: { items?: AssetResponseDto[] } })?.assets?.items ?? [];
			if (items.length > 0) {
				return {
					assetIds: items.map((a) => a.id),
					total: items.length
				};
			}
			// SDK returned no results — fall through to DB substring search
		} catch {
			// SDK OCR search not available — fall through to direct DB query
		}
	}

	// Direct DB query for all modes (and fallback for contains)
	const serviceUserId = IMMICH_SERVICE_USER_ID;
	if (!serviceUserId) {
		throw new Error('IMMICH_SERVICE_USER_ID not configured');
	}

	let pattern: string;
	switch (mode) {
		case 'exact':
			pattern = query;
			break;
		case 'startsWith':
			pattern = `${query}%`;
			break;
		case 'endsWith':
			pattern = `%${query}`;
			break;
		case 'contains':
		default:
			pattern = `%${query}%`;
			break;
	}

	const useIlike = mode !== 'exact';
	const operator = useIlike ? 'ILIKE' : '=';

	const client = await immichPool.connect();
	try {
		const result = await client.query(
			`
			SELECT DISTINCT a.id AS "assetId"
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

		return {
			assetIds: result.rows.map((r: { assetId: string }) => r.assetId),
			total: result.rows.length
		};
	} finally {
		client.release();
	}
}

export { getAllPeople };
