import { NO_SELECTION, isInWindow, type AppState, type Derived, type Selection, type TimeWindow } from './appState.ts';
import type { ShowRef } from './model.ts';
import { showsAtPlaces } from './places.ts';
import type { UrlState } from './urlState.ts';

/** What the sidebar shows: the band and place lists, or a list it drilled down into. */
export type SidebarPanel = 'lists' | 'selection' | 'previews';

export function sidebarPanel(state: Pick<AppState, 'selection' | 'previewsOpen' | 'previewResults'>): SidebarPanel {
  if (state.selection.kind !== 'none') return 'selection';
  return state.previewsOpen && state.previewResults.length > 0 ? 'previews' : 'lists';
}

/** A shared link names places before bands before single shows; unknown bands are ignored. */
export function selectionFromUrl(url: Pick<UrlState, 'selectedPlaces' | 'selectedBandIds' | 'selectedShowIds'>, knownBandIds: ReadonlySet<string>): Selection {
  if (url.selectedPlaces.length > 0) return { kind: 'places', places: new Set(url.selectedPlaces) };
  const bandIds = url.selectedBandIds.filter((id) => knownBandIds.has(id));
  if (bandIds.length > 0) return { kind: 'bands', bandIds: new Set(bandIds) };
  if (url.selectedShowIds.length > 0) return { kind: 'shows', showIds: new Set(url.selectedShowIds) };
  return NO_SELECTION;
}

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
