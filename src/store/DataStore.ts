import type { BandFile } from '../data/types.ts';

/**
 * Read access to band data. Views depend only on this interface, so a remote adapter
 * (Firebase, Supabase, ...) can replace the bundled data without touching them.
 * listBands returns the current snapshot; subscribe announces a new one.
 */
export interface DataStore {
  listBands(): readonly BandFile[];
  getBand(id: string): BandFile | undefined;
  subscribe(listener: () => void): () => void;
}
