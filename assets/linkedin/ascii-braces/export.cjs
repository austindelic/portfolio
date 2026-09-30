// Packaging only: artwork is generated with image_gen; branding comes from the original.
// Run with SHARP_MODULE pointing to the installed sharp package if it is not local.
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const dir = __dirname;
const names = ['Clean', 'Oversized', 'Tilted', 'Perspective', 'Trails', 'Dissolve'];
const original = path.join(dir, 'sources/tns-original-6336x1584.png');
const regions = [
  { left: 3100, top: 620, width: 3100, height: 380 },
  { left: 3400, top: 1240, width: 2800, height: 240 },
];
const white = { r: 255, g: 255, b: 255 };
const blank = (width, height) => sharp({ create: { width, height, channels: 3, background: white } });
const hash = async p => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');

async function main() {
  const originalHash = await hash(original);
  const brandInputs = await Promise.all(regions.map(async r => ({
    input: await sharp(original).extract(r).png().toBuffer(), left: r.left, top: r.top,
  })));
  const plate = await blank(6336, 1584).composite(brandInputs).png().toBuffer();
  const smallRightStart = Math.floor(1584 * 0.485);
  const smallBrand = await sharp(plate).resize(1584, 396).png().toBuffer();
  const smallBrandStrip = await sharp(smallBrand)
    .extract({ left: smallRightStart, top: 0, width: 1584 - smallRightStart, height: 396 }).png().toBuffer();
  const results = [];
  const sheetInputs = [];
  for (const [i, name] of names.entries()) {
    const slug = `${String(i + 1).padStart(2, '0')}-${name.toLowerCase()}`;
    const source = path.join(dir, `sources/${slug}-generated.png`);
    const meta = await sharp(source).metadata();
    const width = Math.floor(meta.width / 4) * 4;
    const height = width / 4;
    const artworkWidth = Math.floor(width * 0.465);
    const artwork = await sharp(source)
      .extract({ left: 0, top: 0, width: Math.floor(meta.width * 0.49), height: meta.height })
      .resize(artworkWidth, height, { fit: name === 'Oversized' ? 'cover' : 'contain', background: white })
      .png().toBuffer();
    const resizedPlate = await sharp(plate).resize(width, height).png().toBuffer();
    const rightStart = Math.floor(width * 0.485);
    const branding = await sharp(resizedPlate)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height }).png().toBuffer();
    const masterPath = path.join(dir, `masters/${slug}-${width}x${height}.png`);
    const smallPath = path.join(dir, `linkedin/${slug}-1584x396.png`);
    await blank(width, height).composite([
      { input: artwork, left: 0, top: 0 },
      { input: branding, left: rightStart, top: 0 },
    ]).png().toFile(masterPath);
    const scaled = await sharp(masterPath).resize(1584, 396).png().toBuffer();
    await sharp(scaled).composite([{ input: smallBrandStrip, left: smallRightStart, top: 0 }]).png().toFile(smallPath);
    // Fully decode both files, validate dimensions, and compare locked brand pixels.
    for (const [file, w, h] of [[masterPath, width, height], [smallPath, 1584, 396]]) {
      const { info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, w); assert.equal(info.height, h);
    }
    const actualBrand = await sharp(masterPath)
      .extract({ left: rightStart, top: 0, width: width - rightStart, height }).raw().toBuffer();
    assert.deepEqual(actualBrand, await sharp(branding).raw().toBuffer());
    const actualSmallBrand = await sharp(smallPath)
      .extract({ left: smallRightStart, top: 0, width: 1584 - smallRightStart, height: 396 }).raw().toBuffer();
    assert.deepEqual(actualSmallBrand, await sharp(smallBrandStrip).raw().toBuffer());
    const label = Buffer.from(`<svg width="1584" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="1584" height="64" fill="#f1f4ff"/><text x="24" y="42" font-family="monospace" font-size="28" fill="#191919">${String(i + 1).padStart(2, '0')} / ${name.toUpperCase()}</text></svg>`);
    const y = 100 + i * 484;
    sheetInputs.push({ input: label, left: 40, top: y });
    sheetInputs.push({ input: smallPath, left: 40, top: y + 64 });
    results.push({ name, source: path.relative(dir, source), generatedDimensions: [meta.width, meta.height],
      master: path.relative(dir, masterPath), masterDimensions: [width, height],
      linkedin: path.relative(dir, smallPath), linkedinDimensions: [1584, 396],
      sha256: await hash(smallPath), brandingPixelComparison: 'passed' });
  }
  const heading = Buffer.from('<svg width="1584" height="70" xmlns="http://www.w3.org/2000/svg"><text x="24" y="48" font-family="monospace" font-size="36" fill="#245BFF">TNS / ASCII BRACE VARIANTS</text></svg>');
  sheetInputs.push({ input: heading, left: 40, top: 15 });
  await blank(1664, 3020).composite(sheetInputs).png().toFile(path.join(dir, 'comparison-1664x3020.png'));
  assert.equal(await hash(original), originalHash);
  await fs.writeFile(path.join(dir, 'verification.json'), JSON.stringify({ originalSha256: originalHash,
    originalUnchanged: true, generationTool: 'built-in image_gen', variants: results }, null, 2) + '\n');
  console.log(JSON.stringify(results.map(r => ({ name: r.name, master: r.masterDimensions, linkedin: r.linkedinDimensions, branding: r.brandingPixelComparison })), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
