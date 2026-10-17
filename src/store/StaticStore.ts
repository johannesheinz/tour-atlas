import type { BandFile } from '../data/types.ts';
import type { DataStore } from './DataStore.ts';

/** Band data inlined at build time. It never changes, so subscribers are never called. */
export class StaticStore implements DataStore {
  readonly #bands: readonly BandFile[];
  readonly #bandsById: ReadonlyMap<string, BandFile>;

  constructor(bands: readonly BandFile[]) {
    this.#bands = bands.toSorted((a, b) => (a.band.id < b.band.id ? -1 : 1));
    this.#bandsById = new Map(bands.map((file) => [file.band.id, file]));
  }

  listBands(): readonly BandFile[] {
    return this.#bands;
  }

  getBand(id: string): BandFile | undefined {
    return this.#bandsById.get(id);
  }

  subscribe(_listener: () => void): () => void {
    return () => {};
  }
}
