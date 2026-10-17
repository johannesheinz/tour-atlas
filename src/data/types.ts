export const SCHEMA_VERSION = 1;

export const SHOW_STATUSES = ['scheduled', 'cancelled', 'postponed', 'soldout'] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export const GEO_PRECISIONS = ['venue', 'city'] as const;
export type GeoPrecision = (typeof GEO_PRECISIONS)[number];

export const GEO_SOURCES = ['nominatim', 'manual'] as const;
export type GeoSource = (typeof GEO_SOURCES)[number];

export interface Geo {
  readonly lat: number;
  readonly lon: number;
  readonly precision: GeoPrecision;
  readonly source: GeoSource;
}

export interface Band {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  /** Ids from data/tags.json, in vocabulary order. */
  readonly tags: readonly string[];
  /** Where the logo comes from; tools/logos.ts stores it as data/logos/<id>.webp. */
  readonly logoUrl: string | null;
}

export interface Source {
  readonly url: string;
  readonly retrievedAt: string;
}

interface ShowDetails {
  readonly date: string;
  readonly endDate: string | null;
  readonly startTime: string | null;
  readonly tourName: string | null;
  readonly eventName: string | null;
  readonly venue: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly countryCode: string;
  readonly status: ShowStatus | null;
  readonly ticketUrl: string | null;
  readonly sourceUrl: string | null;
  readonly notes: string | null;
}

/** A show as the upstream pipeline may deliver it: id and geo are filled in later by the tools. */
export interface DraftShow extends ShowDetails {
  readonly id: string | null;
  readonly geo: Geo | null;
}

/** A show with a stable id; geo may still be missing (normalized draft). */
export interface IdentifiedShow extends ShowDetails {
  readonly id: string;
  readonly geo: Geo | null;
}

/** A show as stored in data/bands/: complete. */
export interface Show extends ShowDetails {
  readonly id: string;
  readonly geo: Geo;
}

export interface BandFileOf<S> {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly band: Band;
  readonly source: Source;
  readonly shows: readonly S[];
}

export type DraftBandFile = BandFileOf<DraftShow>;
export type IdentifiedBandFile = BandFileOf<IdentifiedShow>;
export type BandFile = BandFileOf<Show>;

/** Canonical key order. Shared by the validator, normalize and the schema test. */
export const BAND_FILE_KEYS = ['schemaVersion', 'band', 'source', 'shows'] as const satisfies readonly (keyof DraftBandFile)[];
export const BAND_KEYS = ['id', 'name', 'color', 'tags', 'logoUrl'] as const satisfies readonly (keyof Band)[];
export const SOURCE_KEYS = ['url', 'retrievedAt'] as const satisfies readonly (keyof Source)[];
export const GEO_KEYS = ['lat', 'lon', 'precision', 'source'] as const satisfies readonly (keyof Geo)[];
export const SHOW_KEYS = [
  'id',
  'date',
  'endDate',
  'startTime',
  'tourName',
  'eventName',
  'venue',
  'city',
  'region',
  'countryCode',
  'status',
  'ticketUrl',
  'sourceUrl',
  'notes',
  'geo',
] as const satisfies readonly (keyof DraftShow)[];

export type ShowKey = (typeof SHOW_KEYS)[number];

type MissingKeys<T, K extends readonly PropertyKey[]> = Exclude<keyof T, K[number]>;
type AssertAllKeysListed<T extends never> = T;
export type KeyListsAreComplete = [
  AssertAllKeysListed<MissingKeys<DraftBandFile, typeof BAND_FILE_KEYS>>,
  AssertAllKeysListed<MissingKeys<Band, typeof BAND_KEYS>>,
  AssertAllKeysListed<MissingKeys<Source, typeof SOURCE_KEYS>>,
  AssertAllKeysListed<MissingKeys<Geo, typeof GEO_KEYS>>,
  AssertAllKeysListed<MissingKeys<DraftShow, typeof SHOW_KEYS>>,
];

export const LIMITS = {
  showsPerFile: 2000,
  tagsPerBand: 12,
  bandName: 120,
  city: 100,
  region: 100,
  venue: 160,
  tourName: 160,
  eventName: 160,
  notes: 500,
  url: 2048,
  endDateMaxDaysAfterDate: 14,
  minYear: 1950,
  maxYear: 2100,
} as const;
