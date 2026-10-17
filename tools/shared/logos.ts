import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OutputInfo } from 'sharp';

/** Stored size: crisp at the 18–24 px the app shows, on 2x and 3x screens. */
export const LOGO_HEIGHT = 80;
export const LOGO_MAX_WIDTH = 400;
export const MAX_DOWNLOAD_BYTES = 5_000_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const WORKING_SIZE = 1200;
const ALPHA_BACKGROUND_THRESHOLD = 32;
const COLOUR_DISTANCE_FLOOR = 24;
const COLOUR_DISTANCE_GAIN = 2.2;

export class LogoError extends Error {}

export interface LogoRequest {
  readonly bandId: string;
  readonly logoUrl: string;
}

export interface LogoReport {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly { readonly bandId: string; readonly reason: string }[];
  readonly orphans: readonly string[];
}

export interface LogoDependencies {
  readonly fetch: typeof fetch;
  readonly userAgent: string;
  readonly force: boolean;
}

export function logoPath(logosDir: string, bandId: string): string {
  return join(logosDir, `${bandId}.webp`);
}

/** Downloads missing logos (all with force) and reports bands whose logo could not be stored. */
export async function syncLogos(requests: readonly LogoRequest[], logosDir: string, deps: LogoDependencies): Promise<LogoReport> {
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: { bandId: string; reason: string }[] = [];
  for (const { bandId, logoUrl } of requests) {
    const target = logoPath(logosDir, bandId);
    if (existsSync(target) && !deps.force) {
      skipped.push(bandId);
      continue;
    }
    try {
      const image = await downloadImage(logoUrl, deps);
      writeFileSync(target, await logoSilhouette(image));
      written.push(bandId);
    } catch (error) {
      if (!(error instanceof LogoError)) throw error;
      failed.push({ bandId, reason: error.message });
    }
  }
  const wanted = new Set(requests.map((request) => `${request.bandId}.webp`));
  const orphans = existsSync(logosDir) ? readdirSync(logosDir).filter((name) => name.endsWith('.webp') && !wanted.has(name)) : [];
  return { written, skipped, failed, orphans };
}

export async function downloadImage(url: string, deps: Pick<LogoDependencies, 'fetch' | 'userAgent'>): Promise<Buffer> {
  if (!/^https?:\/\//.test(url)) throw new LogoError(`${url} is not an http(s) address`);
  let response: Response;
  try {
    response = await deps.fetch(url, { headers: { 'User-Agent': deps.userAgent, Accept: 'image/*' }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new LogoError(`download failed (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) throw new LogoError(`the server answered ${response.status} ${response.statusText}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new LogoError(`expected an image, got "${type || 'no content type'}"; link the image file itself, not a page`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_DOWNLOAD_BYTES) throw new LogoError(`the image is ${Math.round(declared / 1_000_000)} MB; the limit is ${MAX_DOWNLOAD_BYTES / 1_000_000} MB`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_DOWNLOAD_BYTES) throw new LogoError(`the image is larger than ${MAX_DOWNLOAD_BYTES / 1_000_000} MB`);
  return body;
}

/**
 * Turns any logo into a black silhouette on transparency, so the app can print it in its ink colour
 * (inverted in dark mode). A transparent background keeps its alpha; an opaque one is keyed out by
 * colour distance from the corners.
 */
export async function logoSilhouette(input: Buffer): Promise<Buffer> {
  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(input, { density: 300 })
      .resize({ width: WORKING_SIZE, height: WORKING_SIZE, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new LogoError(`not a readable image (${error instanceof Error ? error.message : String(error)})`);
  }
  const { data, info } = decoded;
  const { width, height } = info;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const mean = (channel: number) => corners.reduce((sum, offset) => sum + (data[offset + channel] ?? 0), 0) / corners.length;
  const background = { r: mean(0), g: mean(1), b: mean(2), a: mean(3) };
  const transparentBackground = background.a < ALPHA_BACKGROUND_THRESHOLD;

  const mask = Buffer.alloc(width * height * 4);
  let visible = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    let strength: number;
    if (transparentBackground) {
      strength = alpha;
    } else {
      const distance = Math.hypot((data[offset] ?? 0) - background.r, (data[offset + 1] ?? 0) - background.g, (data[offset + 2] ?? 0) - background.b);
      const keyed = Math.max(0, Math.min(255, ((distance / 441.7) * 255 - COLOUR_DISTANCE_FLOOR) * COLOUR_DISTANCE_GAIN));
      strength = Math.round((keyed * alpha) / 255);
    }
    mask[offset + 3] = strength;
    if (strength > 32) visible++;
  }
  if (visible < (width * height) / 400) throw new LogoError('the image has no shape that stands out from its background');
  return sharp(mask, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ height: LOGO_HEIGHT, width: LOGO_MAX_WIDTH, fit: 'inside' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
}
