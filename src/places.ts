import type { TimeWindow } from './appState.ts';
import { isInWindow } from './appState.ts';
import { slugify } from './data/ids.ts';
import type { ShowRef } from './model.ts';

/** "de" for a country, "de.berlin" for a city. Lowercase so it fits the URL hash. */
export type PlaceKey = string;

export interface CityPlace {
  readonly key: PlaceKey;
  readonly city: string;
  readonly showCount: number;
  readonly bandCount: number;
}

export interface CountryPlace {
  readonly key: PlaceKey;
  readonly countryCode: string;
  readonly name: string;
  readonly showCount: number;
  readonly cities: readonly CityPlace[];
}

export const PLACE_KEY_PATTERN = /^[a-z]{2}(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export function cityKey(ref: ShowRef): PlaceKey {
  return `${ref.show.countryCode.toLowerCase()}.${slugify(ref.show.city)}`;
}

export function countryKey(ref: ShowRef): PlaceKey {
  return ref.show.countryCode.toLowerCase();
}

export function matchesPlaces(ref: ShowRef, keys: ReadonlySet<PlaceKey>): boolean {
  return keys.has(cityKey(ref)) || keys.has(countryKey(ref));
}

/** Shows at the places, inside the window (all shows when there is no window). */
export function showsAtPlaces(shows: readonly ShowRef[], keys: ReadonlySet<PlaceKey>, window: TimeWindow | null): ShowRef[] {
  return shows.filter((ref) => matchesPlaces(ref, keys) && (window === null || isInWindow(ref, window)));
}

/** Countries by name with their cities by show count; only places with shows in the window. */
export function buildPlaces(shows: readonly ShowRef[], window: TimeWindow | null, countryName: (code: string) => string): CountryPlace[] {
  const inRange = window === null ? shows : shows.filter((ref) => isInWindow(ref, window));
  const byCountry = Map.groupBy(inRange, (ref) => ref.show.countryCode);
  return [...byCountry.entries()]
    .map(([countryCode, refs]) => {
      const byCity = Map.groupBy(refs, cityKey);
      const cities = [...byCity.entries()]
        .map(([key, cityRefs]) => ({
          key,
          city: cityRefs[0]?.show.city ?? key,
          showCount: cityRefs.length,
          bandCount: new Set(cityRefs.map((ref) => ref.band.file.band.id)).size,
        }))
        .toSorted((a, b) => b.showCount - a.showCount || a.city.localeCompare(b.city));
      return { key: countryCode.toLowerCase(), countryCode, name: countryName(countryCode), showCount: refs.length, cities };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Readable name of a set of places, for headings: "Berlin", "Germany", "Berlin and 2 more". */
export function describePlaces(keys: ReadonlySet<PlaceKey>, shows: readonly ShowRef[], countryName: (code: string) => string): string {
  const names = [...keys].map((key) => {
    const [code, city] = key.split('.');
    if (city === undefined) return countryName((code ?? '').toUpperCase());
    return shows.find((ref) => cityKey(ref) === key)?.show.city ?? city;
  });
  const [first, ...rest] = names;
  if (first === undefined) return '';
  return rest.length === 0 ? first : `${first} and ${rest.length} more`;
}
