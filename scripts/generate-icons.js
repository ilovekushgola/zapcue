import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const svgPath = path.resolve('public/icons/logo.svg');
const outDir = path.resolve('public/icons');

async function generate() {
  console.log('Generating crisp extension icons from logo.svg...');
  const svgBuffer = fs.readFileSync(svgPath);

  const sizes = [16, 32, 48, 128];

  for (const size of sizes) {
    const dest = path.join(outDir, `icon${size}.png`);
    await sharp(svgBuffer, { density: 300 })
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toFile(dest);

    console.log(`✓ Generated icon${size}.png (${size}x${size})`);
  }

  // Also remove test-icon.html if exists
  const testHtml = path.join(outDir, 'test-icon.html');
  if (fs.existsSync(testHtml)) fs.unlinkSync(testHtml);

  console.log('Done!');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
