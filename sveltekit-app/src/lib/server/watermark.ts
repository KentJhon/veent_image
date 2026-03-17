import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
	WATERMARK_BRAND_NAME,
	WATERMARK_OPACITY,
	WATERMARK_CACHE_DIR,
	WATERMARK_MAX_PREVIEW_WIDTH
} from './env.js';

// Ensure cache directory exists
if (!existsSync(WATERMARK_CACHE_DIR)) {
	mkdirSync(WATERMARK_CACHE_DIR, { recursive: true });
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// XML-escape text for safe SVG embedding
function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Generate a professional diagonal tiled watermark SVG.
 *
 * Design: Multi-layer approach that's resistant to cropping/editing:
 * - Layer 1: Diagonal grid of brand text at main opacity
 * - Layer 2: Offset grid of brand text at lower opacity (fills gaps)
 * - Layer 3: Thin diagonal lines connecting the text for anti-crop protection
 */
function createWatermarkSvg(
	width: number,
	height: number,
	brandName: string,
	opacity: number
): Buffer {
	const safeBrand = escapeXml(brandName);
	const fontSize = Math.max(18, Math.min(width, height) / 14);
	const smallFontSize = fontSize * 0.55;
	const spacing = fontSize * 5;

	// Diagonal dimension (need to cover corners after rotation)
	const diagonal = Math.sqrt(width * width + height * height);
	const rows = Math.ceil(diagonal / spacing) + 4;
	const cols = Math.ceil(diagonal / spacing) + 4;
	const offsetX = -(diagonal - width) / 2;
	const offsetY = -(diagonal - height) / 2;

	let elements = '';

	// Layer 1: Primary brand text grid (rotated -30deg)
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const x = offsetX + col * spacing;
			const y = offsetY + row * spacing;
			elements += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" fill="white" fill-opacity="${opacity}" letter-spacing="2">${safeBrand}</text>`;
		}
	}

	// Layer 2: Offset grid with copyright symbol (fills gaps between primary)
	const halfSpacing = spacing / 2;
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const x = offsetX + col * spacing + halfSpacing;
			const y = offsetY + row * spacing + halfSpacing;
			elements += `<text x="${x}" y="${y}" font-size="${smallFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="400" fill="white" fill-opacity="${opacity * 0.6}" letter-spacing="1">\u00A9 ${safeBrand}</text>`;
		}
	}

	// Layer 3: Subtle diagonal lines for anti-crop
	const lineOpacity = opacity * 0.15;
	const lineSpacing = spacing * 1.5;
	for (let i = -rows; i < rows + cols; i++) {
		const x1 = offsetX + i * lineSpacing;
		const y1 = offsetY;
		const x2 = x1 + diagonal;
		const y2 = y1 + diagonal;
		elements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="white" stroke-opacity="${lineOpacity}" stroke-width="0.5"/>`;
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
		<g transform="rotate(-30 ${width / 2} ${height / 2})">
			${elements}
		</g>
	</svg>`;

	return Buffer.from(svg);
}

/**
 * Apply a watermark to an image buffer.
 *
 * For unpurchased images:
 * - Caps resolution to WATERMARK_MAX_PREVIEW_WIDTH (default 1200px)
 * - Applies multi-layer tiled watermark
 * - Outputs as JPEG at 80% quality
 */
export async function applyWatermark(
	imageBuffer: Buffer,
	brandName: string = WATERMARK_BRAND_NAME,
	opacity: number = WATERMARK_OPACITY
): Promise<Buffer> {
	const metadata = await sharp(imageBuffer).metadata();
	let width = metadata.width ?? 800;
	let height = metadata.height ?? 600;

	// Build the sharp pipeline
	let pipeline = sharp(imageBuffer);

	// Cap resolution for unpurchased previews
	if (width > WATERMARK_MAX_PREVIEW_WIDTH) {
		const scale = WATERMARK_MAX_PREVIEW_WIDTH / width;
		width = WATERMARK_MAX_PREVIEW_WIDTH;
		height = Math.round(height * scale);
		pipeline = pipeline.resize(width, height, { fit: 'inside', withoutEnlargement: true });
	}

	const watermarkSvg = createWatermarkSvg(width, height, brandName, opacity);

	return pipeline
		.composite([{ input: watermarkSvg, top: 0, left: 0 }])
		.jpeg({ quality: 80, mozjpeg: true })
		.toBuffer();
}

/**
 * Get a watermarked version of an image, using a filesystem cache with TTL.
 */
export async function getWatermarkedImage(
	assetId: string,
	size: string,
	imageBuffer: Buffer,
	brandName: string = WATERMARK_BRAND_NAME
): Promise<Buffer> {
	const cacheKey = `${assetId}-${size}.jpg`;
	const cachePath = join(WATERMARK_CACHE_DIR, cacheKey);

	// Check cache with TTL
	try {
		const stat = statSync(cachePath);
		const age = Date.now() - stat.mtimeMs;
		if (age < CACHE_TTL_MS) {
			return await readFile(cachePath);
		}
	} catch {
		// Cache miss
	}

	const watermarked = await applyWatermark(imageBuffer, brandName);

	// Write to cache (fire and forget)
	writeFile(cachePath, watermarked).catch(() => {});

	return watermarked;
}

/**
 * Clear the watermark cache. Call when branding/settings change.
 */
export function clearWatermarkCache(): { cleared: number } {
	let cleared = 0;
	try {
		const files = readdirSync(WATERMARK_CACHE_DIR);
		for (const file of files) {
			if (file.endsWith('.jpg')) {
				unlinkSync(join(WATERMARK_CACHE_DIR, file));
				cleared++;
			}
		}
	} catch {
		// ignore
	}
	return { cleared };
}

/**
 * Get cache statistics.
 */
export function getWatermarkCacheStats(): { files: number; sizeMb: number } {
	try {
		const files = readdirSync(WATERMARK_CACHE_DIR).filter((f) => f.endsWith('.jpg'));
		let totalSize = 0;
		for (const file of files) {
			const stat = statSync(join(WATERMARK_CACHE_DIR, file));
			totalSize += stat.size;
		}
		return { files: files.length, sizeMb: Math.round((totalSize / 1024 / 1024) * 100) / 100 };
	} catch {
		return { files: 0, sizeMb: 0 };
	}
}
