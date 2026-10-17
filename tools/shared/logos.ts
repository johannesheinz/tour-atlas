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
/** An image with at least this share of transparent pixels uses its alpha channel as the shape. */
const TRANSPARENT_SHARE = 0.05;
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

export interface ImageFacts {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** "svg" for vector files, otherwise whether all four corners are transparent. */
  readonly transparentBackground: boolean | 'svg';
}

export async function describeImage(body: Buffer): Promise<ImageFacts> {
  const meta = await sharp(body, { density: 150 }).metadata().catch((error: unknown) => {
    throw new LogoError(`not a readable image (${error instanceof Error ? error.message : String(error)})`);
  });
  const format = meta.format ?? 'unknown';
  let transparentBackground: boolean | 'svg' = 'svg';
  if (format !== 'svg') {
    const { data, info } = await sharp(body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] ?? 255;
    const last = { x: info.width - 1, y: info.height - 1 };
    transparentBackground = [alpha(0, 0), alpha(last.x, 0), alpha(0, last.y), alpha(last.x, last.y)].every((value) => value < ALPHA_BACKGROUND_THRESHOLD);
  }
  return { format, width: meta.width ?? 0, height: meta.height ?? 0, bytes: body.byteLength, transparentBackground };
}

/** Writes <band-id>.orig.png (as downloaded) and <band-id>.png (the silhouette the app shows) on the app's paper colour. */
export async function writePreviews(body: Buffer, outDir: string, bandId: string): Promise<{ original: string; silhouette: string }> {
  const paper = '#e3e4df';
  const original = join(outDir, `${bandId}.orig.png`);
  const silhouette = join(outDir, `${bandId}.png`);
  await sharp(body, { density: 150 }).resize({ width: 600, height: 300, fit: 'inside' }).flatten({ background: paper }).png().toFile(original);
  await sharp(await logoSilhouette(body)).flatten({ background: paper }).png().toFile(silhouette);
  return { original, silhouette };
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
  let transparentPixels = 0;
  for (let offset = 3; offset < data.length; offset += 4) if ((data[offset] ?? 255) < ALPHA_BACKGROUND_THRESHOLD) transparentPixels++;
  const transparentBackground = transparentPixels / (width * height) >= TRANSPARENT_SHARE;
  const background = edgeMedian(data, width, height);

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

/** Median colour of the outermost pixel ring: robust against lettering that touches a corner. */
function edgeMedian(data: Buffer, width: number, height: number): { r: number; g: number; b: number } {
  const channels: [number[], number[], number[]] = [[], [], []];
  const take = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    channels.forEach((values, channel) => values.push(data[offset + channel] ?? 0));
  };
  for (let x = 0; x < width; x++) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    take(0, y);
    take(width - 1, y);
  }
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  return { r: median(channels[0]), g: median(channels[1]), b: median(channels[2]) };
}
