import { matchesTagFilter } from './data/tags.ts';
import type { BandFile } from './data/types.ts';
import type { PreviewResult } from './preview.ts';
import { buildBandEntries, showRefs, sortBands, type BandEntry, type BandSort, type ShowRef } from './model.ts';
import type { ThemePreference } from './model.ts';
import type { TimePreset } from './view/timePresets.ts';
import type { MapMode, MapViewPreset } from './view/mapRegions.ts';
import type { PlaceKey } from './places.ts';

/** What the sidebar lists instead of the band and place lists. Places and bands resolve live to their shows in the time window. */
export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'shows'; readonly showIds: ReadonlySet<string> }
  | { readonly kind: 'places'; readonly places: ReadonlySet<PlaceKey> }
  | { readonly kind: 'bands'; readonly bandIds: ReadonlySet<string> };

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
  /** Fit to shows (follows the timeline), a region, or the area around the viewer. */
  readonly mapView: MapViewPreset;
  readonly mapMode: MapMode;
  /** The viewer's position, only after they asked for "Near me". Held in memory, never stored or sent. */
  readonly userPosition: readonly [lon: number, lat: number] | null;
  readonly locationStatus: string | null;
  readonly theme: ThemePreference;
  readonly today: string;
}

export interface Derived {
  readonly bands: readonly BandEntry[];
  readonly orderedBands: readonly BandEntry[];
  /** Ordered bands that pass the tag filter, visible or not. */
  readonly filteredBands: readonly BandEntry[];
  readonly visibleBands: readonly BandEntry[];
  readonly visibleShows: readonly ShowRef[];
  readonly showsById: ReadonlyMap<string, ShowRef>;
  readonly refsByBand: ReadonlyMap<BandEntry, readonly ShowRef[]>;
}

/** Recomputes derived data only when its inputs change identity, so views can compare by reference. */
export function createDeriver(): (state: AppState) => Derived {
  let bundled: readonly BandFile[] | null = null;
  let previews: readonly BandFile[] | null = null;
  let today: string | null = null;
  let bands: readonly BandEntry[] = [];
  let refsByBand = new Map<BandEntry, readonly ShowRef[]>();
  let showsById: ReadonlyMap<string, ShowRef> = new Map();

  let orderKey: [readonly BandEntry[], BandSort, string] | null = null;
  let orderedBands: readonly BandEntry[] = [];

  let filterKey: [readonly BandEntry[], ReadonlySet<string>] | null = null;
  let filteredBands: readonly BandEntry[] = [];

  let visibleKey: [readonly BandEntry[], ReadonlySet<string>] | null = null;
  let visibleBands: readonly BandEntry[] = [];
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
    if (orderKey === null || orderKey[0] !== bands || orderKey[1] !== state.bandSort || orderKey[2] !== state.today) {
      orderKey = [bands, state.bandSort, state.today];
      orderedBands = sortBands(bands, state.bandSort, state.today);
    }
    if (filterKey === null || filterKey[0] !== orderedBands || filterKey[1] !== state.tagFilter) {
      filterKey = [orderedBands, state.tagFilter];
      filteredBands = orderedBands.filter((band) => matchesTagFilter(band.file.band.tags, state.tagFilter));
    }
    if (visibleKey === null || visibleKey[0] !== filteredBands || visibleKey[1] !== state.hiddenBandIds) {
      visibleKey = [filteredBands, state.hiddenBandIds];
      visibleBands = filteredBands.filter((band) => !state.hiddenBandIds.has(band.file.band.id));
      visibleShows = visibleBands.flatMap((band) => refsByBand.get(band) ?? []);
    }
    return { bands, orderedBands, filteredBands, visibleBands, visibleShows, showsById, refsByBand };
  };
}

export function isInWindow(ref: ShowRef, window: TimeWindow): boolean {
  return ref.end >= window.start && ref.start <= window.end;
}
