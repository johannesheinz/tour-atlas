import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGO_HEIGHT, LogoError, describeImage, downloadImage, logoSilhouette, syncLogos, writePreviews } from '../../tools/shared/logos.ts';

async function blackBoxOnWhite(): Promise<Buffer> {
  const box = await sharp({ create: { width: 120, height: 40, channels: 3, background: '#000000' } }).png().toBuffer();
  return sharp({ create: { width: 200, height: 80, channels: 3, background: '#ffffff' } }).composite([{ input: box, left: 40, top: 20 }]).png().toBuffer();
}

async function redDiscOnTransparency(): Promise<Buffer> {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#e00"/></svg>';
  return Buffer.from(svg);
}

async function alphaAt(webp: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3] ?? -1;
}

const image = (body: Buffer, type = 'image/png') => new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': type } });

describe('logoSilhouette', () => {
  it('keys out an opaque background and keeps the shape opaque', async () => {
    const result = await logoSilhouette(await blackBoxOnWhite());
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.height).toBe(LOGO_HEIGHT);
    expect(await alphaAt(result, Math.floor((meta.width ?? 0) / 2), LOGO_HEIGHT / 2)).toBeGreaterThan(200);
  });

  it('keeps the alpha of a transparent logo, including SVG', async () => {
    const result = await logoSilhouette(await redDiscOnTransparency());
    const meta = await sharp(result).metadata();
    expect(await alphaAt(result, Math.floor((meta.width ?? 0) / 2), Math.floor((meta.height ?? 0) / 2))).toBeGreaterThan(200);
    expect(await alphaAt(result, 0, 0)).toBeLessThan(40);
  });

  it('handles transparent logos whose shape touches the corners', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect x="0" y="0" width="30" height="30"/><rect x="170" y="50" width="30" height="30"/><rect x="60" y="20" width="80" height="40"/></svg>';
    const result = await logoSilhouette(Buffer.from(svg));
    const meta = await sharp(result).metadata();
    expect(await alphaAt(result, Math.floor((meta.width ?? 0) / 2), Math.floor((meta.height ?? 0) / 2))).toBeGreaterThan(200);
  });

  it('refuses an image without a visible shape', async () => {
    const blank = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await expect(logoSilhouette(blank)).rejects.toThrow(LogoError);
  });
});

describe('describeImage and writePreviews', () => {
  it('reports format, size and whether the background is transparent', async () => {
    expect(await describeImage(await blackBoxOnWhite())).toMatchObject({ format: 'png', width: 200, height: 80, transparentBackground: false });
    expect((await describeImage(await redDiscOnTransparency())).transparentBackground).toBe('svg');
  });

  it('writes the original and the silhouette preview', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tour-atlas-preview-'));
    const files = await writePreviews(await blackBoxOnWhite(), dir, 'test');
    expect(existsSync(files.original)).toBe(true);
    expect(existsSync(files.silhouette)).toBe(true);
  });
});

describe('downloadImage', () => {
  const deps = (response: Response) => ({ fetch: vi.fn(async () => response) as unknown as typeof fetch, userAgent: 'test' });

  it('refuses pages and oversized files', async () => {
    await expect(downloadImage('https://example.org/logo', deps(new Response('<html>', { headers: { 'content-type': 'text/html' } })))).rejects.toThrow(/link the image file itself/);
    await expect(downloadImage('https://example.org/logo.png', deps(new Response('', { headers: { 'content-type': 'image/png', 'content-length': '9000000' } })))).rejects.toThrow(/limit is 5 MB/);
    await expect(downloadImage('ftp://example.org/logo.png', deps(image(Buffer.alloc(1))))).rejects.toThrow(/not an http/);
  });
});

describe('syncLogos', () => {
  it('stores missing logos, keeps existing ones and reports failures and orphans', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tour-atlas-logos-'));
    writeFileSync(join(dir, 'kept.webp'), 'existing');
    writeFileSync(join(dir, 'gone.webp'), 'orphan');
    const png = await blackBoxOnWhite();
    const fetchMock = vi.fn(async (url: string | URL) => (String(url).includes('broken') ? new Response('nope', { status: 404, statusText: 'Not Found' }) : image(png)));
    const report = await syncLogos(
      [
        { bandId: 'new', logoUrl: 'https://example.org/new.png' },
        { bandId: 'kept', logoUrl: 'https://example.org/kept.png' },
        { bandId: 'broken', logoUrl: 'https://example.org/broken.png' },
      ],
      dir,
      { fetch: fetchMock as unknown as typeof fetch, userAgent: 'test', force: false },
    );
    expect(report.written).toEqual(['new']);
    expect(report.skipped).toEqual(['kept']);
    expect(report.failed).toEqual([{ bandId: 'broken', reason: 'the server answered 404 Not Found' }]);
    expect(report.orphans).toEqual(['gone.webp']);
    expect(existsSync(join(dir, 'new.webp'))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
