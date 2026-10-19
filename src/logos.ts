import logoSizes from 'virtual:logo-sizes';

const logoFiles = import.meta.glob<string>('/data/logos/*.webp', { eager: true, query: '?url', import: 'default' });

const logoUrls: ReadonlyMap<string, string> = new Map(
  Object.entries(logoFiles).map(([path, url]) => [path.split('/').at(-1)?.replace(/\.webp$/, '') ?? path, url]),
);

export interface Logo {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/** The stored silhouette logo of a band with its pixel size, or null. Never a remote address. */
export function logoFor(bandId: string): Logo | null {
  const url = logoUrls.get(bandId);
  if (url === undefined) return null;
  const size = logoSizes[bandId];
  if (size === undefined) throw new Error(`the logo of ${bandId} has no recorded size`);
  return { url, width: size.width, height: size.height };
}
