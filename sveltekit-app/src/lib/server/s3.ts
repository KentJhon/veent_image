import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { S3_URL, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION } from './env.js';

export const s3Enabled = !!(S3_URL && S3_BUCKET);

let _client: S3Client | null = null;

function getClient(): S3Client {
	if (!_client) {
		_client = new S3Client({
			endpoint: S3_URL,
			region: S3_REGION,
			credentials: {
				accessKeyId: S3_ACCESS_KEY,
				secretAccessKey: S3_SECRET_KEY
			},
			forcePathStyle: true // MinIO / R2 / Spaces compatibility
		});
	}
	return _client;
}

export async function uploadToS3(
	assetId: string,
	filename: string,
	buffer: Buffer,
	contentType: string
): Promise<void> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: `originals/${assetId}`,
			Body: buffer,
			ContentType: contentType,
			ContentDisposition: `attachment; filename="${filename}"`
		})
	);
}

export async function getFromS3(
	assetId: string
): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null> {
	try {
		const res = await getClient().send(
			new GetObjectCommand({
				Bucket: S3_BUCKET,
				Key: `originals/${assetId}`
			})
		);

		if (!res.Body) return null;

		const contentType = res.ContentType ?? 'image/jpeg';
		const disposition = res.ContentDisposition ?? '';
		const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? `photo-${assetId}.jpg`;

		// Convert SDK stream to web ReadableStream
		const webStream = res.Body.transformToWebStream();

		return { stream: webStream, contentType, filename };
	} catch (err: any) {
		if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
			return null;
		}
		throw err;
	}
}

export async function uploadThumbnailToS3(
	assetId: string,
	size: 'thumbnail' | 'preview',
	buffer: Buffer,
	contentType: string
): Promise<void> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: `${size}s/${assetId}`,
			Body: buffer,
			ContentType: contentType
		})
	);
}

export async function getThumbnailFromS3(
	assetId: string,
	size: 'thumbnail' | 'preview'
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const res = await getClient().send(
			new GetObjectCommand({
				Bucket: S3_BUCKET,
				Key: `${size}s/${assetId}`
			})
		);

		if (!res.Body) return null;

		const bytes = await res.Body.transformToByteArray();
		return {
			buffer: Buffer.from(bytes),
			contentType: res.ContentType ?? 'image/jpeg'
		};
	} catch (err: any) {
		if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
			return null;
		}
		throw err;
	}
}
