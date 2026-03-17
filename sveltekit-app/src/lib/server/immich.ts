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
import { IMMICH_API_URL, IMMICH_API_KEY } from './env.js';

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

export { getAllPeople };
