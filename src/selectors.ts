import { isInWindow, type AppState, type Derived, type Selection } from './appState.ts';
import { selectionShows } from './selection.ts';
import type { ShowRef } from './model.ts';
import { countryName } from './view/format.ts';
import { buildPlaces, type CountryPlace } from './places.ts';
import type { TimelineLane } from './view/timeline.ts';
import { buildSearchIndex, type SearchEntry } from './view/searchIndex.ts';

export type ShowFilter = (ref: ShowRef) => boolean;

/** Memoised view inputs: each returns the same object until its inputs change, so views can compare by reference. */
export function createSelectors(maxBandsWithRoutes: number) {
  let routeKey = '';
  let routeBandIds: ReadonlySet<string> = new Set();

  let windowKey: AppState['timeWindow'] = null;
  let windowFilter: ShowFilter | null = null;

  let mapKey: [readonly ShowRef[], ShowFilter | null] | null = null;
  let mapShows: readonly ShowRef[] = [];

  let lanesKey: [Derived['visibleBands'], AppState['timeWindow'], boolean] | null = null;
  let lanes: { readonly shown: readonly TimelineLane[]; readonly hiddenCount: number } = { shown: [], hiddenCount: 0 };

  let selectionKey: [Selection, AppState['timeWindow'], Derived] | null = null;
  let selection: readonly ShowRef[] = [];
  let selectedIdsKey: readonly ShowRef[] | null = null;
  let selectedIds: ReadonlySet<string> = new Set();

  let placesKey: [readonly ShowRef[], AppState['timeWindow']] | null = null;
  let places: readonly CountryPlace[] = [];

  let tagCountKey: Derived['bands'] | null = null;
  let tagCounts: ReadonlyMap<string, number> = new Map();

  let searchKey: Derived['bands'] | null = null;
  let searchIndex: readonly SearchEntry[] = [];

  return {
    routeBandIds(current: AppState, derived: Derived): ReadonlySet<string> {
      const ids =
        derived.visibleBands.length <= maxBandsWithRoutes
          ? derived.visibleBands.map((band) => band.file.band.id)
          : [
              ...(current.focusBandId === null ? [] : [current.focusBandId]),
              ...[...this.selectedIds(current, derived), ...current.hoverShowIds].flatMap((id) => derived.showsById.get(id)?.band.file.band.id ?? []),
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

    /** Shows drawn on the map: with Follow timeline only those inside the timeline window. */
    mapShows(derived: Derived, filter: ShowFilter | null): readonly ShowRef[] {
      if (mapKey === null || mapKey[0] !== derived.visibleShows || mapKey[1] !== filter) {
        mapKey = [derived.visibleShows, filter];
        mapShows = filter === null ? derived.visibleShows : derived.visibleShows.filter(filter);
      }
      return mapShows;
    },

    /** Timeline lanes in band-list order; with hideEmptyLanes, bands without a show in the window collapse. */
    lanes(current: AppState, derived: Derived): { readonly shown: readonly TimelineLane[]; readonly hiddenCount: number } {
      if (lanesKey === null || lanesKey[0] !== derived.visibleBands || lanesKey[1] !== current.timeWindow || lanesKey[2] !== current.hideEmptyLanes) {
        lanesKey = [derived.visibleBands, current.timeWindow, current.hideEmptyLanes];
        const all = derived.visibleBands.map((band) => ({ band, shows: derived.refsByBand.get(band) ?? [] }));
        const window = current.timeWindow;
        const shown = current.hideEmptyLanes && window !== null ? all.filter((lane) => lane.shows.some((ref) => isInWindow(ref, window))) : all;
        lanes = { shown, hiddenCount: all.length - shown.length };
      }
      return lanes;
    },

    selection(current: AppState, derived: Derived): readonly ShowRef[] {
      const key = selectionKey;
      if (key === null || key[0] !== current.selection || key[1] !== current.timeWindow || key[2].visibleShows !== derived.visibleShows || key[2].refsByBand !== derived.refsByBand) {
        selectionKey = [current.selection, current.timeWindow, derived];
        selection = selectionShows(current.selection, current.timeWindow, derived);
      }
      return selection;
    },

    selectedIds(current: AppState, derived: Derived): ReadonlySet<string> {
      const refs = this.selection(current, derived);
      if (refs !== selectedIdsKey) {
        selectedIdsKey = refs;
        selectedIds = new Set(refs.map((ref) => ref.show.id));
      }
      return selectedIds;
    },

    places(current: AppState, derived: Derived): readonly CountryPlace[] {
      if (placesKey === null || placesKey[0] !== derived.visibleShows || placesKey[1] !== current.timeWindow) {
        placesKey = [derived.visibleShows, current.timeWindow];
        places = buildPlaces(derived.visibleShows, current.timeWindow, countryName);
      }
      return places;
    },

    tagCounts(derived: Derived): ReadonlyMap<string, number> {
      if (derived.bands !== tagCountKey) {
        tagCountKey = derived.bands;
        const counts = new Map<string, number>();
        for (const band of derived.bands) {
          for (const tag of band.file.band.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        tagCounts = counts;
      }
      return tagCounts;
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
