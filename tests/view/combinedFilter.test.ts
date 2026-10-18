import { describe, expect, it } from 'vitest';
import { NO_SELECTION, activeArea, createDeriver, type AppState, type Selection, type TimeWindow } from '../../src/appState.ts';
import { parseIsoDate } from '../../src/data/dates.ts';
import type { BandFile, Show } from '../../src/data/types.ts';
import { createSelectors } from '../../src/selectors.ts';
import { mapViewFromUrl, parseUrlState } from '../../src/urlState.ts';
import { pointView } from '../../src/view/aroundPoint.ts';
import { MAP_REGIONS, type MapViewPreset } from '../../src/view/mapRegions.ts';
import { makeFile, makeShow } from '../helpers.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();

const STOCKHOLM = { city: 'Stockholm', countryCode: 'SE', geo: { lat: 59.33, lon: 18.07, precision: 'city', source: 'manual' } } as const;
const UPPSALA = { city: 'Uppsala', countryCode: 'SE', geo: { lat: 59.86, lon: 17.64, precision: 'city', source: 'manual' } } as const;
const BERLIN = { city: 'Berlin', countryCode: 'DE', geo: { lat: 52.52, lon: 13.405, precision: 'city', source: 'manual' } } as const;
const MADRID = { city: 'Madrid', countryCode: 'ES', geo: { lat: 40.42, lon: -3.7, precision: 'city', source: 'manual' } } as const;

function show(bandId: string, date: string, place: Pick<Show, 'city' | 'countryCode' | 'geo'>): Show {
  return makeShow({ id: `${bandId}-${date}-${place.city.toLowerCase()}`, date, ...place });
}

function band(id: string, tags: readonly string[], shows: readonly Show[]): BandFile {
  const file = makeFile(shows, id);
  return { ...file, band: { ...file.band, name: id, tags: [...tags] } } as BandFile;
}

const BUNDLED: readonly BandFile[] = [
  band('alpha', ['power-metal'], [show('alpha', '2026-11-05', STOCKHOLM), show('alpha', '2026-11-20', BERLIN), show('alpha', '2027-02-10', UPPSALA)]),
  band('beta', ['power-metal', 'doom-metal'], [show('beta', '2026-12-01', BERLIN), show('beta', '2027-05-01', STOCKHOLM)]),
  band('gamma', ['doom-metal'], [show('gamma', '2026-11-15', MADRID)]),
];

const NEAR_STOCKHOLM: Pick<AppState, 'mapView' | 'userPosition'> = { mapView: { kind: 'near', radius: { value: 100, unit: 'km' } }, userPosition: [18.07, 59.33] };
const NO_AREA: Pick<AppState, 'mapView' | 'userPosition'> = { mapView: { kind: 'shows' }, userPosition: [18.07, 59.33] };
const NEXT_3_MONTHS: TimeWindow = { start: day('2026-10-16'), end: day('2027-01-16') };
const NEXT_12_MONTHS: TimeWindow = { start: day('2026-10-16'), end: day('2027-10-16') };

function appState(overrides: Partial<AppState> = {}): AppState {
  return {
    bundled: BUNDLED,
    previewResults: [],
    previews: [],
    previewsOpen: false,
    hiddenBandIds: new Set(),
    tagFilter: new Set(),
    bandSort: 'show-count',
    bandFilter: '',
    focusBandId: null,
    hoverShowIds: new Set(),
    selection: NO_SELECTION,
    timeWindow: null,
    followTimeline: true,
    timePreset: null,
    hideEmptyLanes: true,
    includePastMonth: false,
    tourPacing: 'calendar',
    mapView: { kind: 'shows' },
    pickRadius: null,
    mapMode: 'flat',
    userPosition: null,
    locationStatus: null,
    style: 'stage',
    theme: 'auto',
    today: '2026-10-16',
    ...overrides,
  };
}

const showIds = (refs: readonly { show: { id: string } }[]) => refs.map((ref) => ref.show.id);
const bandId = (entry: { file: { band: { id: string } } }) => entry.file.band.id;

/** Everything the views show, as plain data. */
function viewsOf(derive: ReturnType<typeof createDeriver>, select: ReturnType<typeof createSelectors>, state: AppState) {
  const derived = derive(state);
  const inRange = select.bandsInRange(state, derived);
  const lanes = select.lanes(state, derived);
  const nearby = select.nearbyShows(state, derived);
  return {
    visibleShows: showIds(derived.visibleShows),
    mapShows: showIds(select.mapShows(derived, select.windowFilter(state))),
    bandList: inRange.ordered.map((entry) => [bandId(entry), showIds(inRange.shows.get(entry) ?? [])]),
    lanes: lanes.shown.map((lane) => [bandId(lane.band), showIds(lane.shows)]),
    hiddenLanes: lanes.hiddenCount,
    places: select.places(state, derived),
    genres: select.genres(state, derived),
    selection: showIds(select.selection(state, derived)),
    nearby: nearby === null ? null : showIds(nearby),
  };
}

function viewsAfter(steps: readonly Partial<AppState>[]) {
  const derive = createDeriver();
  const select = createSelectors(10);
  let state = appState();
  for (const step of steps) {
    state = { ...state, ...step };
    viewsOf(derive, select, state);
  }
  return { state, views: viewsOf(derive, select, state) };
}

describe('activeArea', () => {
  it('is only active for "Near me" with a known position', () => {
    expect(activeArea({ mapView: { kind: 'shows' }, userPosition: [18.07, 59.33] })).toBeNull();
    const [europe] = MAP_REGIONS;
    if (europe === undefined) throw new Error('no region');
    expect(activeArea({ mapView: { kind: 'region', region: europe }, userPosition: [18.07, 59.33] })).toBeNull();
    expect(activeArea({ mapView: NEAR_STOCKHOLM.mapView, userPosition: null })).toBeNull();
    expect(activeArea(NEAR_STOCKHOLM)).toEqual({ center: [18.07, 59.33], radius: { value: 100, unit: 'km' } });
  });

  it('centres on a picked point, with or without a known position of the viewer', () => {
    const picked = pointView([13.4049, 52.5201], { value: 50, unit: 'km' });
    expect(activeArea({ mapView: picked, userPosition: null })).toEqual({ center: [13.4, 52.52], radius: { value: 50, unit: 'km' } });
    expect(activeArea({ mapView: picked, userPosition: [18.07, 59.33] })).toEqual({ center: [13.4, 52.52], radius: { value: 50, unit: 'km' } });
  });
});

describe('the area as a filter', () => {
  it('leaves everything as it is without an area, down to the same objects', () => {
    const derived = createDeriver()(appState(NO_AREA));
    expect(derived.area).toBeNull();
    expect(derived.refsInScope).toBe(derived.refsByBand);
    expect(derived.visibleShows).toBe(derived.bandShows);
  });

  it('limits the visible shows and every band to the area, and keeps the unscoped shows for presets and search', () => {
    const derived = createDeriver()(appState(NEAR_STOCKHOLM));
    expect(showIds(derived.visibleShows)).toEqual(['alpha-2026-11-05-stockholm', 'alpha-2027-02-10-uppsala', 'beta-2027-05-01-stockholm']);
    expect(derived.bandShows).toHaveLength(6);
    expect(derived.showsById.size).toBe(6);
    const gamma = [...derived.refsInScope.keys()].find((entry) => bandId(entry) === 'gamma');
    if (gamma === undefined) throw new Error('gamma missing');
    expect(derived.refsInScope.get(gamma)).toEqual([]);
    expect(derived.refsByBand.get(gamma)).toHaveLength(1);
  });

  it('combines the area with the time window in the band list, lanes, places, genres and nearby shows', () => {
    const { views } = viewsAfter([{ ...NEAR_STOCKHOLM, timeWindow: NEXT_3_MONTHS }]);
    expect(views.mapShows).toEqual(['alpha-2026-11-05-stockholm']);
    expect(views.bandList).toEqual([
      ['alpha', ['alpha-2026-11-05-stockholm']],
      ['beta', []],
      ['gamma', []],
    ]);
    expect(views.lanes).toEqual([['alpha', ['alpha-2026-11-05-stockholm', 'alpha-2027-02-10-uppsala']]]);
    expect(views.hiddenLanes).toBe(2);
    expect(views.places.map((country) => [country.countryCode, country.cities.map((city) => [city.city, city.showCount])])).toEqual([['SE', [['Stockholm', 1]]]]);
    expect(views.genres.map((genre) => [genre.id, genre.bandCount, genre.showCount])).toEqual([
      ['doom-metal', 0, 0],
      ['power-metal', 1, 1],
    ]);
    expect(views.nearby).toEqual(['alpha-2026-11-05-stockholm']);
  });

  it('counts the nearby shows in the window even when the map does not follow the timeline', () => {
    const { views } = viewsAfter([{ ...NEAR_STOCKHOLM, timeWindow: NEXT_3_MONTHS, followTimeline: false }]);
    expect(views.mapShows).toHaveLength(3);
    expect(views.nearby).toEqual(['alpha-2026-11-05-stockholm']);
    expect(viewsAfter([{ timeWindow: NEXT_3_MONTHS }]).views.nearby).toBeNull();
  });

  it('limits band, genre, place and nearby selections to the area and the window', () => {
    const selected = (selection: Selection, window: TimeWindow) => viewsAfter([{ ...NEAR_STOCKHOLM, selection, timeWindow: window }]).views.selection;
    expect(selected({ kind: 'bands', bandIds: new Set(['alpha']) }, NEXT_12_MONTHS)).toEqual(['alpha-2026-11-05-stockholm', 'alpha-2027-02-10-uppsala']);
    expect(selected({ kind: 'bands', bandIds: new Set(['gamma']) }, NEXT_12_MONTHS)).toEqual([]);
    expect(selected({ kind: 'genres', genreIds: new Set(['doom-metal']) }, NEXT_12_MONTHS)).toEqual(['beta-2027-05-01-stockholm']);
    expect(selected({ kind: 'places', places: new Set(['de.berlin']) }, NEXT_12_MONTHS)).toEqual([]);
    expect(selected({ kind: 'places', places: new Set(['se']) }, NEXT_3_MONTHS)).toEqual(['alpha-2026-11-05-stockholm']);
    expect(selected({ kind: 'nearby' }, NEXT_3_MONTHS)).toEqual(['alpha-2026-11-05-stockholm']);
    expect(selected({ kind: 'nearby' }, NEXT_12_MONTHS)).toEqual(['alpha-2026-11-05-stockholm', 'alpha-2027-02-10-uppsala', 'beta-2027-05-01-stockholm']);
  });

  it('keeps picked shows as picked, wherever they are', () => {
    const picked: Selection = { kind: 'shows', showIds: new Set(['gamma-2026-11-15-madrid']) };
    expect(viewsAfter([{ ...NEAR_STOCKHOLM, selection: picked, timeWindow: NEXT_3_MONTHS }]).views.selection).toEqual(['gamma-2026-11-15-madrid']);
  });

  it('shows only the band of an open band view, in the area', () => {
    const { views } = viewsAfter([{ ...NEAR_STOCKHOLM, selection: { kind: 'bands', bandIds: new Set(['beta']) }, timeWindow: NEXT_12_MONTHS }]);
    expect(views.mapShows).toEqual(['beta-2027-05-01-stockholm']);
    expect(views.lanes).toEqual([['beta', ['beta-2027-05-01-stockholm']]]);
  });
});

describe('order independence', () => {
  const nearMe = (mapView: MapViewPreset = NEAR_STOCKHOLM.mapView): Partial<AppState> => ({ mapView, userPosition: NEAR_STOCKHOLM.userPosition });
  const fresh = (state: AppState) => viewsOf(createDeriver(), createSelectors(10), state);

  it('gives the same views for the window then the area as for the area then the window', () => {
    const windowFirst = viewsAfter([{ timeWindow: NEXT_3_MONTHS }, nearMe()]);
    const areaFirst = viewsAfter([nearMe(), { timeWindow: NEXT_3_MONTHS }]);
    expect(windowFirst.views).toEqual(areaFirst.views);
    expect(windowFirst.views).toEqual(fresh(windowFirst.state));
  });

  it('gives the same views after any detour through other filters, areas and windows', () => {
    const selection: Selection = { kind: 'genres', genreIds: new Set(['power-metal']) };
    const direct = viewsAfter([{ ...nearMe(), timeWindow: NEXT_12_MONTHS, hiddenBandIds: new Set(['gamma']), selection }]);
    const detour = viewsAfter([
      { timeWindow: NEXT_3_MONTHS },
      { hiddenBandIds: new Set(['gamma', 'beta']) },
      nearMe({ kind: 'near', radius: { value: 1000, unit: 'km' } }),
      { selection },
      { timeWindow: NEXT_12_MONTHS, tagFilter: new Set(['doom-metal']) },
      { mapView: { kind: 'shows' } },
      { selection: { kind: 'nearby' } },
      nearMe(),
      { hiddenBandIds: new Set(['gamma']), tagFilter: new Set(), selection },
      { timeWindow: NEXT_3_MONTHS },
      { timeWindow: NEXT_12_MONTHS },
    ]);
    expect(detour.views).toEqual(direct.views);
    expect(detour.views).toEqual(fresh(detour.state));
  });

  it('returns to the unscoped views when the area is cleared', () => {
    const cleared = viewsAfter([nearMe(), { timeWindow: NEXT_3_MONTHS }, { mapView: { kind: 'shows' } }]);
    const never = viewsAfter([{ timeWindow: NEXT_3_MONTHS }]);
    expect(cleared.views).toEqual(never.views);
    expect(cleared.views.lanes).toHaveLength(3);
  });
});

describe('an area around a picked point', () => {
  const AROUND_STOCKHOLM: Partial<AppState> = { mapView: pointView([18.0712, 59.3291], { value: 100, unit: 'km' }) };
  const fromUrl = (hash: string): Partial<AppState> => ({ mapView: mapViewFromUrl(parseUrlState(hash)) });
  const labelAfter = (steps: readonly Partial<AppState>[]) => {
    const derive = createDeriver();
    const select = createSelectors(10);
    let state = appState();
    for (const step of steps) {
      state = { ...state, ...step };
      select.areaWithin(state, derive(state));
    }
    return select.areaWithin(state, derive(state));
  };

  it('filters every view exactly as Near me does around the same spot', () => {
    const aroundPoint = viewsAfter([{ ...AROUND_STOCKHOLM, timeWindow: NEXT_3_MONTHS }]).views;
    const nearMe = viewsAfter([{ ...NEAR_STOCKHOLM, timeWindow: NEXT_3_MONTHS }]).views;
    expect(aroundPoint).toEqual(nearMe);
    expect(aroundPoint.nearby).toEqual(['alpha-2026-11-05-stockholm']);
  });

  it('gives the same views and label for a point from the URL as for one picked on the map, in any order with the window', () => {
    const picked = viewsAfter([{ timeWindow: NEXT_3_MONTHS }, AROUND_STOCKHOLM]);
    const linked = viewsAfter([fromUrl('#around=59.33,18.07&radius=100km'), { timeWindow: NEXT_3_MONTHS }]);
    expect(linked.views).toEqual(picked.views);
    expect(linked.state.mapView).toEqual(picked.state.mapView);
    expect(labelAfter([{ timeWindow: NEXT_3_MONTHS }, AROUND_STOCKHOLM])).toBe(labelAfter([fromUrl('#around=59.33,18.07&radius=100km'), { timeWindow: NEXT_3_MONTHS }]));
  });

  it('names the nearest city inside the radius, else the coordinates, and Near me by its radius alone', () => {
    expect(labelAfter([AROUND_STOCKHOLM])).toBe('within 100\u00a0km of Stockholm');
    expect(labelAfter([{ mapView: pointView([17.7, 59.8], { value: 100, unit: 'km' }) }])).toBe('within 100\u00a0km of Uppsala');
    expect(labelAfter([{ mapView: pointView([0, 0], { value: 25, unit: 'km' }) }])).toBe('within 25\u00a0km of 0.00°\u00a0N, 0.00°\u00a0E');
    expect(labelAfter([NEAR_STOCKHOLM])).toBe('within 100\u00a0km');
    expect(labelAfter([NO_AREA])).toBeNull();
  });

  it('returns to the unscoped views when Fit to shows clears the point', () => {
    const cleared = viewsAfter([AROUND_STOCKHOLM, { timeWindow: NEXT_3_MONTHS }, { mapView: { kind: 'shows' } }]);
    expect(cleared.views).toEqual(viewsAfter([{ timeWindow: NEXT_3_MONTHS }]).views);
  });
});
