import { isInWindow, type AppState, type Derived } from './appState.ts';
import type { ShowRef } from './model.ts';
import { countryName } from './view/format.ts';
import type { TimelineLane } from './view/timeline.ts';
import { buildSearchIndex, type SearchEntry } from './view/searchIndex.ts';

export type ShowFilter = (ref: ShowRef) => boolean;

/** Memoised view inputs: each returns the same object until its inputs change, so views can compare by reference. */
export function createSelectors(maxBandsWithRoutes: number) {
  let routeKey = '';
  let routeBandIds: ReadonlySet<string> = new Set();

  let windowKey: AppState['timeWindow'] = null;
  let windowFilter: ShowFilter | null = null;

  let fitKey: [readonly ShowRef[], ShowFilter | null] | null = null;
  let fitShows: readonly ShowRef[] = [];

  let lanesKey: Derived['visibleBands'] | null = null;
  let lanes: readonly TimelineLane[] = [];

  let selectionKey: [ReadonlySet<string>, ReadonlyMap<string, ShowRef>] | null = null;
  let selection: readonly ShowRef[] = [];

  let searchKey: Derived['bands'] | null = null;
  let searchIndex: readonly SearchEntry[] = [];

  return {
    routeBandIds(current: AppState, derived: Derived): ReadonlySet<string> {
      const ids =
        derived.visibleBands.length <= maxBandsWithRoutes
          ? derived.visibleBands.map((band) => band.file.band.id)
          : [
              ...(current.focusBandId === null ? [] : [current.focusBandId]),
              ...[...current.selectedShowIds, ...current.hoverShowIds].flatMap((id) => derived.showsById.get(id)?.band.file.band.id ?? []),
            ];
      const key = [...new Set(ids)].toSorted().join(',');
      if (key !== routeKey) {
        routeKey = key;
        routeBandIds = new Set(ids);
      }
      return routeBandIds;
    },

    windowFilter(current: AppState): ShowFilter | null {
      const window = current.followTimeline ? current.timeWindow : null;
      if (window !== windowKey) {
        windowKey = window;
        windowFilter = window === null ? null : (ref) => isInWindow(ref, window);
      }
      return windowFilter;
    },

    /** Shows the map fits to: those in the followed window, or all visible ones when the window is empty. */
    fitShows(derived: Derived, filter: ShowFilter | null): readonly ShowRef[] {
      if (fitKey === null || fitKey[0] !== derived.visibleShows || fitKey[1] !== filter) {
        fitKey = [derived.visibleShows, filter];
        const inWindow = filter === null ? derived.visibleShows : derived.visibleShows.filter(filter);
        fitShows = inWindow.length > 0 ? inWindow : derived.visibleShows;
      }
      return fitShows;
    },

    lanes(derived: Derived): readonly TimelineLane[] {
      if (derived.visibleBands !== lanesKey) {
        lanesKey = derived.visibleBands;
        lanes = derived.visibleBands.map((band) => ({ band, shows: derived.refsByBand.get(band) ?? [] }));
      }
      return lanes;
    },

    selection(current: AppState, derived: Derived): readonly ShowRef[] {
      if (selectionKey === null || selectionKey[0] !== current.selectedShowIds || selectionKey[1] !== derived.showsById) {
        selectionKey = [current.selectedShowIds, derived.showsById];
        selection = [...current.selectedShowIds]
          .flatMap((id) => derived.showsById.get(id) ?? [])
          .toSorted((a, b) => a.start - b.start || a.band.file.band.name.localeCompare(b.band.file.band.name));
      }
      return selection;
    },

    searchIndex(derived: Derived): readonly SearchEntry[] {
      if (derived.bands !== searchKey) {
        searchKey = derived.bands;
        searchIndex = buildSearchIndex(derived.bands, countryName);
      }
      return searchIndex;
    },
  };
}
