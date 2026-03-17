/**
 * Quick standalone test for the watermark pipeline.
 * Run: npx tsx scripts/test-watermark.ts
 *
 * Generates a test image, applies the watermark, and saves the result
 * to /tmp/watermark-test-output.jpg for visual inspection.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';

// Inline the watermark logic (can't import from SvelteKit modules directly)
function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createWatermarkSvg(w: number, h: number, brand: string, opacity: number): Buffer {
	const safeBrand = escapeXml(brand);
	const fontSize = Math.max(18, Math.min(w, h) / 14);
	const smallFontSize = fontSize * 0.55;
	const spacing = fontSize * 5;
	const diagonal = Math.sqrt(w * w + h * h);
	const rows = Math.ceil(diagonal / spacing) + 4;
	const cols = Math.ceil(diagonal / spacing) + 4;
	const offsetX = -(diagonal - w) / 2;
	const offsetY = -(diagonal - h) / 2;

	let elements = '';
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const x = offsetX + col * spacing;
			const y = offsetY + row * spacing;
			elements += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" fill="white" fill-opacity="${opacity}" letter-spacing="2">${safeBrand}</text>`;
		}
	}

	const halfSpacing = spacing / 2;
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const x = offsetX + col * spacing + halfSpacing;
			const y = offsetY + row * spacing + halfSpacing;
			elements += `<text x="${x}" y="${y}" font-size="${smallFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="400" fill="white" fill-opacity="${opacity * 0.6}" letter-spacing="1">\u00A9 ${safeBrand}</text>`;
		}
	}

	const lineOpacity = opacity * 0.15;
	const lineSpacing = spacing * 1.5;
	for (let i = -rows; i < rows + cols; i++) {
		const x1 = offsetX + i * lineSpacing;
		elements += `<line x1="${x1}" y1="${offsetY}" x2="${x1 + diagonal}" y2="${offsetY + diagonal}" stroke="white" stroke-opacity="${lineOpacity}" stroke-width="0.5"/>`;
	}

	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="rotate(-30 ${w / 2} ${h / 2})">${elements}</g></svg>`
	);
}

async function main() {
	const width = 1200;
	const height = 800;
	const brand = 'EventSnap';
	const opacity = 0.25;

	console.log(`Generating ${width}x${height} test image...`);

	// Create a gradient-like test image
	const testImage = await sharp({
		create: { width, height, channels: 3, background: { r: 40, g: 70, b: 110 } }
	})
		.jpeg({ quality: 95 })
		.toBuffer();

	console.log(`Test image: ${(testImage.length / 1024).toFixed(0)} KB`);

	const start = Date.now();
	const watermarkSvg = createWatermarkSvg(width, height, brand, opacity);
	const watermarked = await sharp(testImage)
		.composite([{ input: watermarkSvg, top: 0, left: 0 }])
		.jpeg({ quality: 80, mozjpeg: true })
		.toBuffer();
	const elapsed = Date.now() - start;

	const outputPath = '/tmp/watermark-test-output.jpg';
	writeFileSync(outputPath, watermarked);

	console.log(`Watermarked: ${(watermarked.length / 1024).toFixed(0)} KB`);
	console.log(`Time: ${elapsed}ms`);
	console.log(`Saved to: ${outputPath}`);
}

main().catch(console.error);
