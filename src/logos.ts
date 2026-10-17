const logoFiles = import.meta.glob<string>('/data/logos/*.webp', { eager: true, query: '?url', import: 'default' });

const logoUrls: ReadonlyMap<string, string> = new Map(
  Object.entries(logoFiles).map(([path, url]) => [path.split('/').at(-1)?.replace(/\.webp$/, '') ?? path, url]),
);

/** Address of the stored silhouette logo of a band, or null. Never a remote address. */
export function logoFor(bandId: string): string | null {
  return logoUrls.get(bandId) ?? null;
}
