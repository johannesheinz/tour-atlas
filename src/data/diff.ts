import { SHOW_KEYS, type Band, type BandFileOf, type IdentifiedShow, type ShowKey } from './types.ts';

export interface ShowChange {
  readonly id: string;
  readonly before: IdentifiedShow;
  readonly after: IdentifiedShow;
  readonly fields: readonly ShowKey[];
}

export interface BandDiff {
  readonly bandId: string;
  readonly isNewBand: boolean;
  readonly bandFields: readonly (keyof Band)[];
  readonly added: readonly IdentifiedShow[];
  readonly removed: readonly IdentifiedShow[];
  readonly changed: readonly ShowChange[];
  readonly unchangedCount: number;
}

type ComparableFile = BandFileOf<IdentifiedShow>;

/** Compares two versions of a band by show id. `base` is null when the band is new. */
export function diffBand(base: ComparableFile | null, next: ComparableFile): BandDiff {
  const baseById = new Map((base?.shows ?? []).map((show) => [show.id, show]));
  const nextIds = new Set(next.shows.map((show) => show.id));

  const added: IdentifiedShow[] = [];
  const changed: ShowChange[] = [];
  let unchangedCount = 0;
  for (const show of next.shows) {
    const before = baseById.get(show.id);
    if (before === undefined) {
      added.push(show);
      continue;
    }
    const fields = SHOW_KEYS.filter((key) => !sameValue(before[key], show[key]));
    if (fields.length === 0) unchangedCount++;
    else changed.push({ id: show.id, before, after: show, fields });
  }

  const removed = (base?.shows ?? []).filter((show) => !nextIds.has(show.id));
  const bandFields = base === null ? [] : (['name', 'color', 'tags', 'logoUrl'] as const).filter((key) => !sameValue(base.band[key], next.band[key]));

  return { bandId: next.band.id, isNewBand: base === null, bandFields, added, removed, changed, unchangedCount };
}

export function hasChanges(diff: BandDiff): boolean {
  return diff.isNewBand || diff.bandFields.length > 0 || diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aEntries = Object.entries(a);
  const bRecord = new Map(Object.entries(b));
  return aEntries.length === bRecord.size && aEntries.every(([key, value]) => sameValue(value, bRecord.get(key)));
}
