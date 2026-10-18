import { NO_SELECTION, isInWindow, type AppState, type Derived, type Selection, type TimeWindow } from './appState.ts';
import type { ShowRef } from './model.ts';
import { NO_GENRE, hasGenre } from './data/tags.ts';
import { showsAtPlaces } from './places.ts';
import type { UrlState } from './urlState.ts';

/** What the sidebar shows: the band and place lists, or a list it drilled down into. */
export type SidebarPanel = 'lists' | 'selection' | 'previews';

export function sidebarPanel(state: Pick<AppState, 'selection' | 'previewsOpen' | 'previewResults'>): SidebarPanel {
  if (state.selection.kind !== 'none') return 'selection';
  return state.previewsOpen && state.previewResults.length > 0 ? 'previews' : 'lists';
}

/** A shared link names places before bands before genres before single shows; unknown bands and genres are ignored. The nearby shows are never in a link. */
export function selectionFromUrl(
  url: Pick<UrlState, 'selectedPlaces' | 'selectedBandIds' | 'selectedGenres' | 'selectedShowIds'>,
  knownBandIds: ReadonlySet<string>,
  isGenre: (id: string) => boolean,
): Selection {
  if (url.selectedPlaces.length > 0) return { kind: 'places', places: new Set(url.selectedPlaces) };
  const bandIds = url.selectedBandIds.filter((id) => knownBandIds.has(id));
  if (bandIds.length > 0) return { kind: 'bands', bandIds: new Set(bandIds) };
  const genreIds = url.selectedGenres.filter(isGenre);
  if (genreIds.length > 0) return { kind: 'genres', genreIds: new Set(genreIds) };
  if (url.selectedShowIds.length > 0) return { kind: 'shows', showIds: new Set(url.selectedShowIds) };
  return NO_SELECTION;
}

/**
 * Places and the nearby shows resolve to the visible shows, bands and genres to all their shows; all of them in the
 * area and the time window. Picked shows stay as picked. Sorted by date.
 */
export function selectionShows(selection: Selection, window: TimeWindow | null, derived: Pick<Derived, 'visibleShows' | 'showsById' | 'refsInScope'>): readonly ShowRef[] {
  const inWindow = (ref: ShowRef) => window === null || isInWindow(ref, window);
  let refs: readonly ShowRef[];
  switch (selection.kind) {
    case 'none':
      return [];
    case 'shows':
      refs = [...selection.showIds].flatMap((id) => derived.showsById.get(id) ?? []);
      break;
    case 'nearby':
      refs = derived.visibleShows.filter(inWindow);
      break;
    case 'places':
      refs = showsAtPlaces(derived.visibleShows, selection.places, window);
      break;
    case 'bands':
      refs = [...derived.refsInScope].flatMap(([band, bandRefs]) => (selection.bandIds.has(band.file.band.id) ? bandRefs.filter(inWindow) : []));
      break;
    case 'genres':
      refs = [...derived.refsInScope].flatMap(([band, bandRefs]) => (playsGenre(band.file.band.tags, selection.genreIds) ? bandRefs.filter(inWindow) : []));
      break;
  }
  return refs.toSorted((a, b) => a.start - b.start || a.band.file.band.name.localeCompare(b.band.file.band.name));
}

function playsGenre(bandTags: readonly string[], genreIds: ReadonlySet<string>): boolean {
  return bandTags.some((id) => genreIds.has(id)) || (genreIds.has(NO_GENRE) && !hasGenre(bandTags));
}
