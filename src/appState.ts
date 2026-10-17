import type { BandFile } from './data/types.ts';
import { buildBandEntries, showRefs, sortBands, type BandEntry, type BandSort, type ShowRef } from './model.ts';
import type { ThemePreference } from './view/theme.ts';

export interface TimeWindow {
  readonly start: number;
  readonly end: number;
}

export interface AppState {
  readonly bundled: readonly BandFile[];
  readonly previews: readonly BandFile[];
  readonly hiddenBandIds: ReadonlySet<string>;
  readonly bandSort: BandSort;
  readonly bandFilter: string;
  readonly focusBandId: string | null;
  readonly hoverShowIds: ReadonlySet<string>;
  readonly selectedShowIds: ReadonlySet<string>;
  readonly timeWindow: TimeWindow | null;
  readonly followTimeline: boolean;
  readonly theme: ThemePreference;
  readonly today: string;
}

export interface Derived {
  readonly bands: readonly BandEntry[];
  readonly orderedBands: readonly BandEntry[];
  readonly visibleBands: readonly BandEntry[];
  readonly visibleShows: readonly ShowRef[];
  readonly showsById: ReadonlyMap<string, ShowRef>;
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
    if (visibleKey === null || visibleKey[0] !== orderedBands || visibleKey[1] !== state.hiddenBandIds) {
      visibleKey = [orderedBands, state.hiddenBandIds];
      visibleBands = orderedBands.filter((band) => !state.hiddenBandIds.has(band.file.band.id));
      visibleShows = visibleBands.flatMap((band) => refsByBand.get(band) ?? []);
    }
    return { bands, orderedBands, visibleBands, visibleShows, showsById };
  };
}

export function isInWindow(ref: ShowRef, window: TimeWindow): boolean {
  return ref.end >= window.start && ref.start <= window.end;
}
