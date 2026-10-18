import { matchesTagFilter } from './data/tags.ts';
import type { BandFile } from './data/types.ts';
import type { PreviewResult } from './preview.ts';
import { buildBandEntries, byBandName, isInRange, showRefs, type BandEntry, type BandSort, type ShowRef } from './model.ts';
import type { ThemePreference } from './model.ts';
import type { Style } from './data/styles.ts';
import type { TimePreset } from './view/timePresets.ts';
import type { TourPacing } from './view/tourClock.ts';
import { kilometres, showsWithin, type Distance, type MapMode, type MapViewPreset } from './view/mapRegions.ts';
import type { LonLat } from './view/geoFit.ts';
import type { PlaceKey } from './places.ts';

/**
 * What the sidebar lists instead of the band and place lists. Places, bands, genres and the nearby shows resolve
 * live to their shows in the area and the time window; picked shows stay as picked.
 */
export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'shows'; readonly showIds: ReadonlySet<string> }
  | { readonly kind: 'nearby' }
  | { readonly kind: 'places'; readonly places: ReadonlySet<PlaceKey> }
  | { readonly kind: 'bands'; readonly bandIds: ReadonlySet<string> }
  | { readonly kind: 'genres'; readonly genreIds: ReadonlySet<string> };

export const NO_SELECTION: Selection = { kind: 'none' };

export interface TimeWindow {
  readonly start: number;
  readonly end: number;
}

export interface AppState {
  readonly bundled: readonly BandFile[];
  readonly previewResults: readonly PreviewResult[];
  /** Drawable rows of the previews; derived from previewResults when they change. */
  readonly previews: readonly BandFile[];
  /** The previewed files are listed in the sidebar; closing the panel keeps the previews. */
  readonly previewsOpen: boolean;
  readonly hiddenBandIds: ReadonlySet<string>;
  /** Selected tag ids: OR within a tag group, AND across groups. */
  readonly tagFilter: ReadonlySet<string>;
  readonly bandSort: BandSort;
  readonly bandFilter: string;
  readonly focusBandId: string | null;
  readonly hoverShowIds: ReadonlySet<string>;
  readonly selection: Selection;
  readonly timeWindow: TimeWindow | null;
  readonly followTimeline: boolean;
  /** The preset that produced the current window; null once the user zooms or pans. */
  readonly timePreset: TimePreset | null;
  readonly hideEmptyLanes: boolean;
  /** Forward-looking presets start a month back, to follow a running tour. */
  readonly includePastMonth: boolean;
  readonly tourPacing: TourPacing;
  /** Fit to shows (follows the timeline), a region, or the area around the viewer or a picked point. */
  readonly mapView: MapViewPreset;
  /** The area menu waits for a click on the map to centre an area of this radius there. */
  readonly pickRadius: Distance | null;
  readonly mapMode: MapMode;
  /** The viewer's position, only after they asked for "Near me". Held in memory, never stored or sent. */
  readonly userPosition: readonly [lon: number, lat: number] | null;
  readonly locationStatus: string | null;
  readonly style: Style;
  readonly theme: ThemePreference;
  readonly today: string;
}

/** The circle every view is limited to. The radius keeps the viewer's unit, so texts name it as chosen. */
export interface Area {
  readonly center: LonLat;
  readonly radius: Distance;
}

/** A picked point, or "Near me" once the browser has told where the viewer is, limits every view; regions only frame the map. */
export function activeArea(state: Pick<AppState, 'mapView' | 'userPosition'>): Area | null {
  const { mapView } = state;
  if (mapView.kind === 'point') return { center: mapView.center, radius: mapView.radius };
  if (mapView.kind !== 'near' || state.userPosition === null) return null;
  return { center: state.userPosition, radius: mapView.radius };
}

export function showsInArea(refs: readonly ShowRef[], area: Area): ShowRef[] {
  return showsWithin(refs, area.center, kilometres(area.radius));
}

export interface Derived {
  readonly bands: readonly BandEntry[];
  readonly orderedBands: readonly BandEntry[];
  /** Ordered bands that pass the tag filter, visible or not. */
  readonly filteredBands: readonly BandEntry[];
  readonly visibleBands: readonly BandEntry[];
  readonly area: Area | null;
  /** The visible bands' shows in the area: what the map, the timeline and the lists show. */
  readonly visibleShows: readonly ShowRef[];
  /** The visible bands' shows wherever they are, for choices that must not depend on the area (presets, defaults). */
  readonly bandShows: readonly ShowRef[];
  /** Every show, for picked shows and search. */
  readonly showsById: ReadonlyMap<string, ShowRef>;
  /** Every band's shows wherever they are. */
  readonly refsByBand: ReadonlyMap<BandEntry, readonly ShowRef[]>;
  /** Every band's shows in the area; the same map as refsByBand while no area is active. */
  readonly refsInScope: ReadonlyMap<BandEntry, readonly ShowRef[]>;
}

/** Recomputes derived data only when its inputs change identity, so views can compare by reference. */
export function createDeriver(): (state: AppState) => Derived {
  let bundled: readonly BandFile[] | null = null;
  let previews: readonly BandFile[] | null = null;
  let today: string | null = null;
  let bands: readonly BandEntry[] = [];
  let refsByBand = new Map<BandEntry, readonly ShowRef[]>();
  let showsById: ReadonlyMap<string, ShowRef> = new Map();

  let orderKey: readonly BandEntry[] | null = null;
  let orderedBands: readonly BandEntry[] = [];

  let filterKey: [readonly BandEntry[], ReadonlySet<string>] | null = null;
  let filteredBands: readonly BandEntry[] = [];

  let visibleKey: [readonly BandEntry[], ReadonlySet<string>, ReadonlySet<string> | null] | null = null;
  let visibleBands: readonly BandEntry[] = [];
  let bandShows: readonly ShowRef[] = [];

  let areaKey: [AppState['mapView'], AppState['userPosition']] | null = null;
  let area: Area | null = null;

  let scopeKey: [ReadonlyMap<BandEntry, readonly ShowRef[]>, Area | null] | null = null;
  let refsInScope: ReadonlyMap<BandEntry, readonly ShowRef[]> = refsByBand;

  let scopedShowsKey: [readonly BandEntry[], ReadonlyMap<BandEntry, readonly ShowRef[]>] | null = null;
  let visibleShows: readonly ShowRef[] = [];

  return (state) => {
    if (state.bundled !== bundled || state.previews !== previews || state.today !== today) {
      bundled = state.bundled;
      previews = state.previews;
      today = state.today;
      bands = buildBandEntries(state.bundled, state.previews);
      refsByBand = new Map(bands.map((band) => [band, showRefs(band, state.today)]));
      showsById = new Map([...refsByBand.values()].flat().map((ref) => [ref.show.id, ref]));
    }
    if (orderKey !== bands) {
      orderKey = bands;
      orderedBands = bands.toSorted(byBandName);
    }
    if (filterKey === null || filterKey[0] !== orderedBands || filterKey[1] !== state.tagFilter) {
      filterKey = [orderedBands, state.tagFilter];
      filteredBands = orderedBands.filter((band) => matchesTagFilter(band.file.band.tags, state.tagFilter));
    }
    const solo = soloBandIds(state.selection);
    if (visibleKey === null || visibleKey[0] !== filteredBands || visibleKey[1] !== state.hiddenBandIds || visibleKey[2] !== solo) {
      visibleKey = [filteredBands, state.hiddenBandIds, solo];
      visibleBands =
        solo === null ? filteredBands.filter((band) => !state.hiddenBandIds.has(band.file.band.id)) : orderedBands.filter((band) => solo.has(band.file.band.id));
      bandShows = visibleBands.flatMap((band) => refsByBand.get(band) ?? []);
    }
    if (areaKey === null || areaKey[0] !== state.mapView || areaKey[1] !== state.userPosition) {
      areaKey = [state.mapView, state.userPosition];
      area = activeArea(state);
    }
    if (scopeKey === null || scopeKey[0] !== refsByBand || scopeKey[1] !== area) {
      scopeKey = [refsByBand, area];
      const scopeArea = area;
      refsInScope = scopeArea === null ? refsByBand : new Map([...refsByBand].map(([band, refs]) => [band, showsInArea(refs, scopeArea)]));
    }
    if (scopedShowsKey === null || scopedShowsKey[0] !== visibleBands || scopedShowsKey[1] !== refsInScope) {
      scopedShowsKey = [visibleBands, refsInScope];
      visibleShows = refsInScope === refsByBand ? bandShows : visibleBands.flatMap((band) => refsInScope.get(band) ?? []);
    }
    return { bands, orderedBands, filteredBands, visibleBands, area, visibleShows, bandShows, showsById, refsByBand, refsInScope };
  };
}

/** Bands whose dates are open are shown alone, whatever the band list hides; the list itself stays as it was. */
export function soloBandIds(selection: Selection): ReadonlySet<string> | null {
  return selection.kind === 'bands' ? selection.bandIds : null;
}

export function isInWindow(ref: ShowRef, window: TimeWindow): boolean {
  return isInRange(ref, window);
}
