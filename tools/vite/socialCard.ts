import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { checkBandDirectory } from './bandData.ts';

/**
 * One OpenGraph/Twitter card for the whole site: crawlers never see the hash, so every shared link
 * shows the same card. The texts live in index.html as a comment block of `property = text` lines.
 */
export const SOCIAL_CARD_FILE = 'og-card.png';
export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
export const MAX_SOCIAL_CARD_KB = 300;

const TEMPLATE_BLOCK = /([ \t]*)<!-- social-card\n([^]*?)-->\n?/;
const TEMPLATE_PROPERTIES = ['og:site_name', 'og:title', 'og:description', 'og:image:alt'] as const;
type TemplateProperty = (typeof TEMPLATE_PROPERTIES)[number];

/** Every tag the card needs, in the order they are written. */
export const SOCIAL_CARD_TAGS = [
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:card',
] as const;

export interface DataCounts {
  readonly bands: number;
  readonly shows: number;
}

/** Null when the variable is unset; anything set must be the site's absolute https: address ending in "/". */
export function parseSiteUrl(value: string | undefined): URL | null {
  if (value === undefined) return null;
  const problem = siteUrlProblem(value);
  if (problem !== null) throw new Error(`TOUR_ATLAS_SITE_URL ${problem}, for example https://example.org/tour-atlas/ (got "${value}")`);
  return new URL(value);
}

function siteUrlProblem(value: string): string | null {
  if (!URL.canParse(value)) return 'must be an absolute URL';
  const url = new URL(value);
  if (url.protocol !== 'https:') return 'must use https:';
  if (url.username !== '' || url.password !== '') return 'must not contain credentials';
  if (value.includes('?') || value.includes('#')) return 'must not have a query or hash';
  if (!url.pathname.endsWith('/') || !value.endsWith('/')) return 'must end with "/"';
  return null;
}

/** Replaces the template block in index.html with the card's tags, or removes it when there is no site URL. */
export function injectSocialCard(html: string, siteUrl: URL | null, counts: () => DataCounts): string {
  const [, indent, body] = TEMPLATE_BLOCK.exec(html) ?? [];
  if (indent === undefined || body === undefined) throw new Error('social card: index.html needs a <!-- social-card ... --> block in <head>');
  if (siteUrl === null) return html.replace(TEMPLATE_BLOCK, '');
  const texts = fillCounts(parseTemplate(body), counts());
  const content: Record<(typeof SOCIAL_CARD_TAGS)[number], string> = {
    'og:type': 'website',
    'og:site_name': texts['og:site_name'],
    'og:title': texts['og:title'],
    'og:description': texts['og:description'],
    'og:url': siteUrl.href,
    'og:image': new URL(SOCIAL_CARD_FILE, siteUrl).href,
    'og:image:width': String(SOCIAL_CARD_WIDTH),
    'og:image:height': String(SOCIAL_CARD_HEIGHT),
    'og:image:alt': texts['og:image:alt'],
    'twitter:card': 'summary_large_image',
  };
  const tags = SOCIAL_CARD_TAGS.map((tag) => {
    const key = tag.startsWith('twitter:') ? 'name' : 'property';
    return `${indent}<meta ${key}="${tag}" content="${escapeAttribute(content[tag])}" />\n`;
  });
  return html.replace(TEMPLATE_BLOCK, () => tags.join(''));
}

function parseTemplate(body: string): Record<TemplateProperty, string> {
  const entries = new Map<string, string>();
  for (const line of body.split('\n').map((text) => text.trim()).filter((text) => text !== '')) {
    const match = /^(\S+)\s+=\s+(.+)$/.exec(line);
    if (match === null || match[1] === undefined || match[2] === undefined) throw new Error(`social card: cannot read "${line}"; write "property = text"`);
    if (!TEMPLATE_PROPERTIES.some((property) => property === match[1])) throw new Error(`social card: unknown property ${match[1]}; expected ${TEMPLATE_PROPERTIES.join(', ')}`);
    if (entries.has(match[1])) throw new Error(`social card: ${match[1]} is given twice`);
    entries.set(match[1], match[2]);
  }
  const text = (property: TemplateProperty) => {
    const value = entries.get(property);
    if (value === undefined) throw new Error(`social card: index.html gives no ${property}`);
    return value;
  };
  return { 'og:site_name': text('og:site_name'), 'og:title': text('og:title'), 'og:description': text('og:description'), 'og:image:alt': text('og:image:alt') };
}

function fillCounts(texts: Record<TemplateProperty, string>, counts: DataCounts): Record<TemplateProperty, string> {
  const number = new Intl.NumberFormat('en-US');
  const values: Readonly<Record<string, string>> = { bands: number.format(counts.bands), shows: number.format(counts.shows) };
  const fill = (text: string) =>
    text.replace(/\{([^}]*)\}/g, (_match, name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`social card: unknown placeholder {${name}}; use {bands} or {shows}`);
      return value;
    });
  return { 'og:site_name': fill(texts['og:site_name']), 'og:title': fill(texts['og:title']), 'og:description': fill(texts['og:description']), 'og:image:alt': fill(texts['og:image:alt']) };
}

export function escapeAttribute(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function countBandData(bandsDir: string): DataCounts {
  const bands = checkBandDirectory(bandsDir).flatMap((entry) => (entry.value === null ? [] : [entry.value]));
  return { bands: bands.length, shows: bands.reduce((sum, band) => sum + band.shows.length, 0) };
}

/** Width and height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
export function pngDimensions(png: Uint8Array): { readonly width: number; readonly height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((byte, index) => png[index] !== byte)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (new TextDecoder().decode(png.subarray(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** What tools/check-dist.ts reports about the card; `png` is og-card.png's bytes when dist has it. */
export function socialCardProblems(html: string, png: Uint8Array | null, required: boolean): string[] {
  const tags = new Map<string, string>();
  for (const match of html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)"/g)) {
    if (match[1] !== undefined && match[2] !== undefined) tags.set(match[1], match[2]);
  }
  const present = SOCIAL_CARD_TAGS.filter((tag) => tags.has(tag));
  const missing = SOCIAL_CARD_TAGS.filter((tag) => !tags.has(tag));
  const problems: string[] = [];
  if (required && png === null) problems.push(`${SOCIAL_CARD_FILE} is missing; build with TOUR_ATLAS_SITE_URL set`);
  if ((required || present.length > 0 || png !== null) && missing.length > 0) problems.push(`social card tags missing: ${missing.join(', ')}`);

  const image = tags.get('og:image');
  if (image !== undefined && !(URL.canParse(image) && new URL(image).protocol === 'https:' && new URL(image).pathname.endsWith(`/${SOCIAL_CARD_FILE}`))) {
    problems.push(`og:image must be the absolute https: address of ${SOCIAL_CARD_FILE}, found "${image}"`);
  }
  if (image !== undefined && png === null && !required) problems.push(`og:image names ${SOCIAL_CARD_FILE}, but dist does not have it`);
  if (tags.has('og:image:width') && tags.get('og:image:width') !== String(SOCIAL_CARD_WIDTH)) problems.push(`og:image:width must be ${SOCIAL_CARD_WIDTH}`);
  if (tags.has('og:image:height') && tags.get('og:image:height') !== String(SOCIAL_CARD_HEIGHT)) problems.push(`og:image:height must be ${SOCIAL_CARD_HEIGHT}`);

  if (png !== null) {
    if (image === undefined) problems.push(`${SOCIAL_CARD_FILE} is not referenced by og:image`);
    const size = pngDimensions(png);
    if (size === null) problems.push(`${SOCIAL_CARD_FILE} is not a PNG`);
    else if (size.width !== SOCIAL_CARD_WIDTH || size.height !== SOCIAL_CARD_HEIGHT) {
      problems.push(`${SOCIAL_CARD_FILE} is ${size.width}x${size.height}; it must be ${SOCIAL_CARD_WIDTH}x${SOCIAL_CARD_HEIGHT}`);
    }
    const kb = png.byteLength / 1000;
    if (kb > MAX_SOCIAL_CARD_KB) problems.push(`${SOCIAL_CARD_FILE} is ${kb.toFixed(1)} kB; it must stay under ${MAX_SOCIAL_CARD_KB} kB`);
  }
  return problems;
}

/** Writes the card's tags into index.html and puts og-card.png next to it, only when the site's address is known. */
export function socialCardPlugin(siteUrl: URL | null, bandsDir: string, imagePath: string): Plugin {
  return {
    name: 'tour-atlas:social-card',
    configResolved(config) {
      if (siteUrl === null && config.command === 'build') {
        config.logger.info('social card: TOUR_ATLAS_SITE_URL is not set, so the build has no OpenGraph tags and no og-card.png');
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => injectSocialCard(html, siteUrl, () => countBandData(bandsDir)),
    },
    generateBundle() {
      if (siteUrl === null) return;
      this.emitFile({ type: 'asset', fileName: SOCIAL_CARD_FILE, source: readFileSync(imagePath) });
    },
  };
}
