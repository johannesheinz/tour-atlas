import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export const BRAND_MARK_PLACEHOLDER = '<!-- brand-mark -->';

/** Puts the globe mark into the masthead and the favicon into <head> as a data: URI, so neither costs a request. */
export function brandPlugin(markPath: string, faviconPath: string): Plugin {
  return {
    name: 'tour-atlas:brand',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => injectBrand(html, readFileSync(markPath, 'utf8'), readFileSync(faviconPath, 'utf8')),
    },
  };
}

export function injectBrand(html: string, markSvg: string, faviconSvg: string): string {
  if (!html.includes(BRAND_MARK_PLACEHOLDER)) throw new Error(`brand: index.html needs ${BRAND_MARK_PLACEHOLDER} where the mark goes`);
  if (!html.includes('</head>')) throw new Error('brand: index.html has no </head> for the favicon link');
  const mark = markSvg.trim();
  if (!mark.startsWith('<svg ')) throw new Error('brand: the mark file must start with <svg');
  const decoratedMark = mark.replace('<svg ', '<svg class="brand-mark" aria-hidden="true" ');
  const iconLink = `<link rel="icon" type="image/svg+xml" href="${faviconDataUri(faviconSvg)}" />`;
  return html.replace(BRAND_MARK_PLACEHOLDER, () => decoratedMark).replace('</head>', () => `  ${iconLink}\n  </head>`);
}

export function faviconDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.trim().replace(/>\s+</g, '><'))}`;
}
