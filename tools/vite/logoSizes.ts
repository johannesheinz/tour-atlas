import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Plugin } from 'vite';

const MODULE_ID = 'virtual:logo-sizes';
const RESOLVED_ID = `\0${MODULE_ID}`;

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Serves the pixel size of every stored logo, read from the WebP headers, so the page reserves their space before they load. */
export function logoSizesPlugin(logosDir: string): Plugin {
  return {
    name: 'tour-atlas:logo-sizes',
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      // The dev server resolves every watched file as an import, so watch the logo files, never their directory.
      for (const path of logoPaths(logosDir)) this.addWatchFile(path);
      return `export default ${JSON.stringify(readLogoSizes(logosDir))};`;
    },
  };
}

function logoPaths(logosDir: string): string[] {
  return readdirSync(logosDir)
    .filter((file) => file.endsWith('.webp'))
    .toSorted()
    .map((file) => join(logosDir, file));
}

export function readLogoSizes(logosDir: string): Record<string, ImageSize> {
  const sizes: Record<string, ImageSize> = {};
  for (const path of logoPaths(logosDir)) {
    const size = webpDimensions(readFileSync(path));
    if (size === null) throw new Error(`${path} is not a WebP image whose size can be read; run "npm run logos -- --force"`);
    sizes[basename(path, '.webp')] = size;
  }
  return sizes;
}

/** Canvas size from a WebP file's first chunk (VP8X, lossy VP8 or lossless VP8L); null for anything else. */
export function webpDimensions(webp: Uint8Array): ImageSize | null {
  if (webp.length < 30 || ascii(webp, 0, 4) !== 'RIFF' || ascii(webp, 8, 12) !== 'WEBP') return null;
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const uint24 = (offset: number) => view.getUint16(offset, true) + ((webp[offset + 2] ?? 0) << 16);
  switch (ascii(webp, 12, 16)) {
    case 'VP8X':
      return { width: uint24(24) + 1, height: uint24(27) + 1 };
    case 'VP8 ': {
      if (webp[23] !== 0x9d || webp[24] !== 0x01 || webp[25] !== 0x2a) return null;
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    case 'VP8L': {
      if (webp[20] !== 0x2f) return null;
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    default:
      return null;
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
