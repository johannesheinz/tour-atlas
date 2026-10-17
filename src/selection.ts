import { isInWindow, type Derived, type Selection, type TimeWindow } from './appState.ts';
import type { ShowRef } from './model.ts';
import { showsAtPlaces } from './places.ts';

/** Places resolve to their visible shows and bands to all their shows, both inside the time window; picked shows stay as picked. Sorted by date. */
export function selectionShows(selection: Selection, window: TimeWindow | null, derived: Pick<Derived, 'visibleShows' | 'showsById' | 'refsByBand'>): readonly ShowRef[] {
  const inWindow = (ref: ShowRef) => window === null || isInWindow(ref, window);
  let refs: readonly ShowRef[];
  switch (selection.kind) {
    case 'none':
      return [];
    case 'shows':
      refs = [...selection.showIds].flatMap((id) => derived.showsById.get(id) ?? []);
      break;
    case 'places':
      refs = showsAtPlaces(derived.visibleShows, selection.places, window);
      break;
    case 'bands':
      refs = [...derived.refsByBand].flatMap(([band, bandRefs]) => (selection.bandIds.has(band.file.band.id) ? bandRefs.filter(inWindow) : []));
      break;
  }
  return refs.toSorted((a, b) => a.start - b.start || a.band.file.band.name.localeCompare(b.band.file.band.name));
}
