import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { escapeAttribute, pngDimensions } from './socialCard.ts';

/**
 * What browsers need to install the site as an app: a web app manifest, PNG icons and the links to them.
 * tools/app-icons.ts renders the icons from the mark and they are committed; the build only copies them.
 * The links go in at build time only, so the dev server never requests files it does not serve.
 */
export const MANIFEST_FILE = 'manifest.webmanifest';
export const APP_NAME = 'Tour Atlas';
/** Stage lights' slate ink, as on the social card: the icons' background and the splash screen. */
export const APP_BACKGROUND = '#1f2a35';

export type IconPurpose = 'any' | 'maskable';

export interface AppIcon {
  readonly file: string;
  readonly size: number;
  readonly purpose: IconPurpose;
}

export const MANIFEST_ICONS: readonly AppIcon[] = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
];
/** iOS ignores the manifest's icons and rounds the corners of this one itself. */
export const APPLE_TOUCH_ICON: AppIcon = { file: 'apple-touch-icon.png', size: 180, purpose: 'any' };
export const APP_ICONS: readonly AppIcon[] = [...MANIFEST_ICONS, APPLE_TOUCH_ICON];
export const WEB_APP_FILES: readonly string[] = [MANIFEST_FILE, ...APP_ICONS.map((icon) => icon.file)];

export interface WebAppManifest {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: 'standalone';
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly { readonly src: string; readonly sizes: string; readonly type: 'image/png'; readonly purpose: IconPurpose }[];
}

/** Relative addresses, so the app works wherever the site is served from (GitHub Pages serves it below a path). */
export function webAppManifest(description: string): WebAppManifest {
  return {
    id: './',
    name: APP_NAME,
    short_name: APP_NAME,
    description,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: MANIFEST_ICONS.map((icon) => ({ src: icon.file, sizes: `${icon.size}x${icon.size}`, type: 'image/png', purpose: icon.purpose })),
  };
}

export function pageDescription(html: string): string {
  const description = /<meta name="description" content="([^"&<>]+)"/.exec(html)?.[1];
  if (description === undefined) throw new Error('web app: index.html needs a <meta name="description"> without markup characters for the manifest');
  return description;
}

export function injectWebAppLinks(html: string): string {
  if (!html.includes('</head>')) throw new Error('web app: index.html has no </head> for the manifest link');
  const links = [
    `<link rel="manifest" href="${MANIFEST_FILE}" />`,
    `<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON.file}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeAttribute(APP_NAME)}" />`,
  ];
  return html.replace('</head>', () => `${links.map((link) => `  ${link}\n`).join('')}  </head>`);
}

/** What tools/check-dist.ts reports about the installable app; `read` returns a file from dist. */
export function webAppProblems(html: string, files: readonly string[], read: (file: string) => Uint8Array): string[] {
  const problems: string[] = [];
  for (const file of WEB_APP_FILES) {
    if (!files.includes(file)) problems.push(`${file} is missing; browsers cannot install the app without it`);
  }
  if (!html.includes(`<link rel="manifest" href="${MANIFEST_FILE}" />`)) problems.push(`index.html does not link ${MANIFEST_FILE}`);
  if (!html.includes(`<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON.file}" />`)) problems.push(`index.html does not link ${APPLE_TOUCH_ICON.file}`);
  if (files.includes(APPLE_TOUCH_ICON.file)) problems.push(...iconProblems(APPLE_TOUCH_ICON.file, `${APPLE_TOUCH_ICON.size}x${APPLE_TOUCH_ICON.size}`, read));
  if (!files.includes(MANIFEST_FILE)) return problems;

  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(read(MANIFEST_FILE)));
  } catch {
    return [...problems, `${MANIFEST_FILE} is not JSON`];
  }
  if (typeof manifest !== 'object' || manifest === null) return [...problems, `${MANIFEST_FILE} is not a JSON object`];
  const field = (name: string): unknown => (manifest as Record<string, unknown>)[name];
  const expected: Readonly<Record<string, string>> = { start_url: './', scope: './', display: 'standalone' };
  for (const [name, value] of Object.entries(expected)) {
    if (field(name) !== value) problems.push(`${MANIFEST_FILE} must set ${name} to "${value}"`);
  }
  for (const name of ['name', 'short_name', 'background_color', 'theme_color']) {
    if (typeof field(name) !== 'string' || field(name) === '') problems.push(`${MANIFEST_FILE} has no ${name}`);
  }

  const icons = field('icons');
  if (!Array.isArray(icons)) return [...problems, `${MANIFEST_FILE} has no icons`];
  const listed = icons.filter((icon): icon is { src: string; sizes: string; purpose?: string } => typeof icon?.src === 'string' && typeof icon?.sizes === 'string');
  if (listed.length !== icons.length) problems.push(`every icon in ${MANIFEST_FILE} needs src and sizes`);
  for (const icon of listed) {
    if (!files.includes(icon.src)) problems.push(`${MANIFEST_FILE} names ${icon.src}, but dist does not have it`);
    else problems.push(...iconProblems(icon.src, icon.sizes, read));
  }
  const has = (sizes: string, purpose: IconPurpose) => listed.some((icon) => icon.sizes === sizes && (icon.purpose ?? 'any').split(' ').includes(purpose));
  if (!has('192x192', 'any')) problems.push(`${MANIFEST_FILE} needs a 192x192 icon`);
  if (!has('512x512', 'any')) problems.push(`${MANIFEST_FILE} needs a 512x512 icon`);
  if (!has('512x512', 'maskable')) problems.push(`${MANIFEST_FILE} needs a 512x512 maskable icon`);
  return problems;
}

function iconProblems(file: string, sizes: string, read: (file: string) => Uint8Array): string[] {
  const size = pngDimensions(read(file));
  if (size === null) return [`${file} is not a PNG`];
  return `${size.width}x${size.height}` === sizes ? [] : [`${file} is ${size.width}x${size.height}; it must be ${sizes}`];
}

export function webAppPlugin(iconDir: string): Plugin {
  let description: string | null = null;
  return {
    name: 'tour-atlas:web-app',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        description = pageDescription(html);
        return injectWebAppLinks(html);
      },
    },
    generateBundle() {
      if (description === null) throw new Error('web app: index.html was not transformed before the bundle was written');
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: `${JSON.stringify(webAppManifest(description), null, 2)}\n` });
      for (const icon of APP_ICONS) this.emitFile({ type: 'asset', fileName: icon.file, source: readFileSync(join(iconDir, icon.file)) });
    },
  };
}
