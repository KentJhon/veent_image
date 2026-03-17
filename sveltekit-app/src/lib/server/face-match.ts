import sharp from 'sharp';
import { IMMICH_ML_URL, IMMICH_SERVICE_USER_ID } from './env.js';
import { immichPool } from './db/immich-readonly.js';

export interface FaceMatchResult {
	matched: boolean;
	assets: Array<{
		id: string;
		personId: string | null;
		assetId: string;
		distance: number;
	}>;
	personIds: string[];
	facesDetected: number;
	error?: string;
}

const ML_TIMEOUT_MS = 15_000;
const MAX_SELFIE_DIMENSION = 1024;

/**
 * Check if the Immich ML service is reachable.
 */
export async function checkMLHealth(): Promise<boolean> {
	try {
		const res = await fetch(`${IMMICH_ML_URL}/ping`, {
			signal: AbortSignal.timeout(3000)
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Preprocess a selfie image before sending to the ML service:
 * - Resize to max MAX_SELFIE_DIMENSION on longest side
 * - Convert to JPEG (normalize format)
 * - Auto-rotate based on EXIF
 */
async function preprocessSelfie(imageBuffer: Buffer): Promise<Buffer> {
	const metadata = await sharp(imageBuffer).metadata();
	const width = metadata.width ?? 0;
	const height = metadata.height ?? 0;

	let pipeline = sharp(imageBuffer).rotate(); // auto-rotate based on EXIF

	if (width > MAX_SELFIE_DIMENSION || height > MAX_SELFIE_DIMENSION) {
		pipeline = pipeline.resize(MAX_SELFIE_DIMENSION, MAX_SELFIE_DIMENSION, {
			fit: 'inside',
			withoutEnlargement: true
		});
	}

	return pipeline.jpeg({ quality: 90 }).toBuffer();
}

/**
 * Validate a selfie image for face matching suitability.
 */
export async function validateSelfie(
	imageBuffer: Buffer
): Promise<{ valid: boolean; error?: string; width?: number; height?: number }> {
	try {
		const metadata = await sharp(imageBuffer).metadata();
		const width = metadata.width ?? 0;
		const height = metadata.height ?? 0;

		if (width < 100 || height < 100) {
			return { valid: false, error: 'Image is too small. Please use a photo at least 100x100 pixels.' };
		}

		if (!metadata.format || !['jpeg', 'png', 'webp', 'heif', 'tiff'].includes(metadata.format)) {
			return { valid: false, error: 'Unsupported image format. Please use JPEG, PNG, or WebP.' };
		}

		return { valid: true, width, height };
	} catch {
		return { valid: false, error: 'Could not read image. The file may be corrupted.' };
	}
}

/**
 * Extract a 512-dimensional face embedding from an image
 * by calling Immich's ML service directly.
 */
export async function extractFaceEmbedding(
	imageBuffer: Buffer
): Promise<{ embedding: number[]; facesDetected: number; score: number }> {
	// Preprocess before sending
	const processed = await preprocessSelfie(imageBuffer);

	const formData = new FormData();
	formData.append(
		'entries',
		JSON.stringify({
			'facial-recognition': {
				detection: { modelName: 'buffalo_l', options: { minScore: 0.7 } },
				recognition: { modelName: 'buffalo_l' }
			}
		})
	);
	formData.append('image', new Blob([new Uint8Array(processed)]));

	const res = await fetch(`${IMMICH_ML_URL}/predict`, {
		method: 'POST',
		body: formData,
		signal: AbortSignal.timeout(ML_TIMEOUT_MS)
	});

	if (!res.ok) {
		throw new Error(`ML service error: ${res.status} ${res.statusText}`);
	}

	const data = await res.json();
	const faces = data['facial-recognition'] as Array<{
		boundingBox: { x1: number; y1: number; x2: number; y2: number };
		embedding: string;
		score: number;
	}>;

	if (!faces || faces.length === 0) {
		throw new Error('No face detected. Please use a clear, well-lit photo showing your face.');
	}

	// Pick the largest (most prominent) face
	const primary = faces.reduce((best, face) => {
		const area =
			(face.boundingBox.x2 - face.boundingBox.x1) *
			(face.boundingBox.y2 - face.boundingBox.y1);
		const bestArea =
			(best.boundingBox.x2 - best.boundingBox.x1) *
			(best.boundingBox.y2 - best.boundingBox.y1);
		return area > bestArea ? face : best;
	});

	const embedding =
		typeof primary.embedding === 'string'
			? JSON.parse(primary.embedding)
			: primary.embedding;

	return { embedding, facesDetected: faces.length, score: primary.score };
}

/**
 * Search for matching faces in a specific event album using
 * direct pgvector cosine similarity query against Immich's database.
 */
export async function searchFacesInAlbum(
	embedding: number[],
	eventAlbumId: string,
	maxDistance = 0.6,
	limit = 200
): Promise<FaceMatchResult> {
	const serviceUserId = IMMICH_SERVICE_USER_ID;

	if (!serviceUserId) {
		return {
			matched: false,
			assets: [],
			personIds: [],
			facesDetected: 0,
			error: 'IMMICH_SERVICE_USER_ID not configured'
		};
	}

	const client = await immichPool.connect();
	try {
		await client.query('BEGIN');
		await client.query('SET LOCAL vchordrq.probes = 1');

		const embeddingStr = `[${embedding.join(',')}]`;

		const result = await client.query(
			`
			WITH cte AS (
				SELECT
					af.id,
					af."personId",
					af."assetId",
					fs.embedding <=> $1::vector AS distance
				FROM asset_face af
				INNER JOIN asset a ON a.id = af."assetId"
				INNER JOIN face_search fs ON fs."faceId" = af.id
				INNER JOIN albums_assets_assets aaa ON aaa."assetsId" = a.id
				WHERE a."ownerId" = ANY($2::uuid[])
					AND a."deletedAt" IS NULL
					AND aaa."albumsId" = $3
				ORDER BY distance
				LIMIT $4
			)
			SELECT DISTINCT ON ("assetId") *
			FROM cte
			WHERE distance <= $5
			ORDER BY "assetId", distance
			`,
			[embeddingStr, [serviceUserId], eventAlbumId, limit, maxDistance]
		);

		await client.query('COMMIT');

		const assets = result.rows.map((row) => ({
			id: row.id,
			personId: row.personId,
			assetId: row.assetId,
			distance: parseFloat(row.distance)
		}));

		const personIds = [
			...new Set(
				assets.map((a) => a.personId).filter((id): id is string => id !== null)
			)
		];

		return { matched: assets.length > 0, assets, personIds, facesDetected: 0 };
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
}

/**
 * Full face matching flow: validate, extract embedding, search.
 */
export async function matchFaceInEvent(
	selfieBuffer: Buffer,
	eventAlbumId: string,
	maxDistance = 0.6
): Promise<FaceMatchResult> {
	const { embedding, facesDetected, score } = await extractFaceEmbedding(selfieBuffer);
	const result = await searchFacesInAlbum(embedding, eventAlbumId, maxDistance);
	result.facesDetected = facesDetected;
	return result;
}
