import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type WebpOptions } from 'sharp';
import { describe, expect, it } from 'vitest';
import { LOGO_HEIGHT, LOGO_MAX_WIDTH, logoSilhouette } from '../../tools/shared/logos.ts';
import { readLogoSizes, webpDimensions } from '../../tools/vite/logoSizes.ts';

async function webp(width: number, height: number, options: WebpOptions, alpha: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 20, g: 20, b: 20, alpha } } }).webp(options).toBuffer();
}

const chunk = (file: Buffer) => file.subarray(12, 16).toString('latin1');

describe('webpDimensions', () => {
  it('reads lossless, lossy and extended WebP files', async () => {
    const lossless = await webp(123, 45, { lossless: true }, 1);
    const lossy = await webp(301, 80, { quality: 80 }, 1);
    const extended = await webp(400, 71, { quality: 90, alphaQuality: 100 }, 0.5);
    expect([chunk(lossless), chunk(lossy), chunk(extended)]).toEqual(['VP8L', 'VP8 ', 'VP8X']);
    expect(webpDimensions(lossless)).toEqual({ width: 123, height: 45 });
    expect(webpDimensions(lossy)).toEqual({ width: 301, height: 80 });
    expect(webpDimensions(extended)).toEqual({ width: 400, height: 71 });
  });

  it('reads the size of a silhouette as npm run logos stores it', async () => {
    const box = await sharp({ create: { width: 300, height: 100, channels: 3, background: '#000000' } }).png().toBuffer();
    const image = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } }).composite([{ input: box, left: 50, top: 50 }]).png().toBuffer();
    const silhouette = await logoSilhouette(image);
    const meta = await sharp(silhouette).metadata();
    expect(webpDimensions(silhouette)).toEqual({ width: meta.width, height: meta.height });
  });

  it('refuses anything that is not a WebP file', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000000' } }).png().toBuffer();
    expect(webpDimensions(png)).toBeNull();
    expect(webpDimensions((await webp(10, 10, { lossless: true }, 1)).subarray(0, 20))).toBeNull();
  });
});

describe('readLogoSizes', () => {
  it('knows the size of every stored logo, within the silhouette limits', () => {
    const sizes = Object.values(readLogoSizes('data/logos'));
    expect(sizes.length).toBeGreaterThan(0);
    for (const { width, height } of sizes) {
      expect(height).toBeLessThanOrEqual(LOGO_HEIGHT);
      expect(width).toBeLessThanOrEqual(LOGO_MAX_WIDTH);
    }
  });

  it('fails when a logo cannot be read, so the build stops', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tour-atlas-logo-sizes-'));
    writeFileSync(join(dir, 'good.webp'), await webp(200, 80, { lossless: true }, 1));
    expect(readLogoSizes(dir)).toEqual({ good: { width: 200, height: 80 } });
    writeFileSync(join(dir, 'broken.webp'), 'not an image');
    expect(() => readLogoSizes(dir)).toThrow(/broken\.webp is not a WebP image/);
  });
});
