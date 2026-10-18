import { isInWindow, type AppState, type Derived, type Selection } from './appState.ts';
import { selectionShows } from './selection.ts';
import { NO_GENRE, TAG_VOCABULARY, hasGenre } from './data/tags.ts';
import { t } from './i18n/index.ts';
import { showsInRange, sortBands, type BandEntry, type ShowRef } from './model.ts';
import { countryName } from './view/format.ts';
import { buildPlaces, type CountryPlace } from './places.ts';
import type { TimelineLane } from './view/timeline.ts';
import { buildSearchIndex, type SearchEntry } from './view/searchIndex.ts';

export type ShowFilter = (ref: ShowRef) => boolean;

/** A row of the Genres tab: a genre tag, or NO_GENRE for bands without one. Counts are for the time window. */
export interface GenreSummary {
  readonly id: string;
  readonly label: string;
  readonly bandCount: number;
  readonly showCount: number;
}

export interface BandsInRange {
  readonly ordered: readonly BandEntry[];
  readonly shows: ReadonlyMap<BandEntry, readonly ShowRef[]>;
}

/** Memoised view inputs: each returns the same object until its inputs change, so views can compare by reference. */
export function createSelectors(maxBandsWithRoutes: number) {
  let routeKey = '';
  let routeBandIds: ReadonlySet<string> = new Set();

  let windowKey: AppState['timeWindow'] = null;
  let windowFilter: ShowFilter | null = null;

  let mapKey: [readonly ShowRef[], ShowFilter | null] | null = null;
  let mapShows: readonly ShowRef[] = [];

  let rangeKey: [Derived['filteredBands'], Derived['refsByBand'], AppState['timeWindow'], AppState['bandSort']] | null = null;
  let bandsInRange: BandsInRange = { ordered: [], shows: new Map() };

  let lanesKey: [BandsInRange, AppState['hiddenBandIds'], boolean] | null = null;
  let lanes: { readonly shown: readonly TimelineLane[]; readonly hiddenCount: number } = { shown: [], hiddenCount: 0 };

  let selectionKey: [Selection, AppState['timeWindow'], Derived] | null = null;
  let selection: readonly ShowRef[] = [];
  let selectedIdsKey: readonly ShowRef[] | null = null;
  let selectedIds: ReadonlySet<string> = new Set();

  let placesKey: [readonly ShowRef[], AppState['timeWindow']] | null = null;
  let places: readonly CountryPlace[] = [];

  let genresKey: [Derived['refsByBand'], AppState['timeWindow']] | null = null;
  let genres: readonly GenreSummary[] = [];

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

    /** Bands that pass the tag filter, sorted by what they play in the time window, with those shows. */
    bandsInRange(current: AppState, derived: Derived): BandsInRange {
      const key = rangeKey;
      if (key === null || key[0] !== derived.filteredBands || key[1] !== derived.refsByBand || key[2] !== current.timeWindow || key[3] !== current.bandSort) {
        rangeKey = [derived.filteredBands, derived.refsByBand, current.timeWindow, current.bandSort];
        const shows = new Map(derived.filteredBands.map((band) => [band, showsInRange(derived.refsByBand.get(band) ?? [], current.timeWindow)] as const));
        bandsInRange = { ordered: sortBands(derived.filteredBands, current.bandSort, (band) => shows.get(band) ?? []), shows };
      }
      return bandsInRange;
    },

    /** Timeline lanes in band-list order; with hideEmptyLanes, bands without a show in the window collapse. */
    lanes(current: AppState, derived: Derived): { readonly shown: readonly TimelineLane[]; readonly hiddenCount: number } {
      const inRange = this.bandsInRange(current, derived);
      if (lanesKey === null || lanesKey[0] !== inRange || lanesKey[1] !== current.hiddenBandIds || lanesKey[2] !== current.hideEmptyLanes) {
        lanesKey = [inRange, current.hiddenBandIds, current.hideEmptyLanes];
        const visible = inRange.ordered.filter((band) => !current.hiddenBandIds.has(band.file.band.id));
        const shown = current.hideEmptyLanes && current.timeWindow !== null ? visible.filter((band) => (inRange.shows.get(band) ?? []).length > 0) : visible;
        lanes = { shown: shown.map((band) => ({ band, shows: derived.refsByBand.get(band) ?? [] })), hiddenCount: visible.length - shown.length };
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

    /** Every genre some band plays, alphabetically, with its bands and shows in the time window. */
    genres(current: AppState, derived: Derived): readonly GenreSummary[] {
      if (genresKey === null || genresKey[0] !== derived.refsByBand || genresKey[1] !== current.timeWindow) {
        genresKey = [derived.refsByBand, current.timeWindow];
        const totals = new Map<string, { bandCount: number; showCount: number }>();
        for (const [band, refs] of derived.refsByBand) {
          const tags = band.file.band.tags;
          const ids = hasGenre(tags) ? tags.filter((id) => TAG_VOCABULARY.byId.get(id)?.group === 'genre') : [NO_GENRE];
          const shows = showsInRange(refs, current.timeWindow).length;
          for (const id of ids) {
            const total = totals.get(id) ?? { bandCount: 0, showCount: 0 };
            totals.set(id, { bandCount: total.bandCount + (shows > 0 ? 1 : 0), showCount: total.showCount + shows });
          }
        }
        const label = (id: string) => (id === NO_GENRE ? t().genreList.noGenre : (TAG_VOCABULARY.byId.get(id)?.label ?? id));
        genres = [...totals]
          .map(([id, total]) => ({ id, label: label(id), ...total }))
          .toSorted((a, b) => Number(a.id === NO_GENRE) - Number(b.id === NO_GENRE) || a.label.localeCompare(b.label));
      }
      return genres;
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
