import { describe, expect, it } from 'vitest';
import { NO_SELECTION, createDeriver, type AppState, type Selection } from '../../src/appState.ts';
import type { BandFile } from '../../src/data/types.ts';
import { makeFile, makeShow } from '../helpers.ts';

const band = (id: string) => makeFile([makeShow({ id: `${id}-2026-11-02-berlin` })], id) as BandFile;

function appState(selection: Selection, hiddenBandIds: ReadonlySet<string>): AppState {
  return {
    bundled: [band('alpha'), band('beta'), band('gamma')],
    previewResults: [],
    previews: [],
    previewsOpen: false,
    hiddenBandIds,
    tagFilter: new Set(),
    bandSort: 'name',
    bandFilter: '',
    focusBandId: null,
    hoverShowIds: new Set(),
    selection,
    timeWindow: null,
    followTimeline: true,
    timePreset: 'next-6-months',
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
  };
}

const ids = (bands: readonly { file: { band: { id: string } } }[]) => bands.map((entry) => entry.file.band.id);

describe('the "only" view of a band selection', () => {
  const hidden = new Set(['beta']);

  it('shows the bands the list shows when nothing or something else is selected', () => {
    const derive = createDeriver();
    expect(ids(derive(appState(NO_SELECTION, hidden)).visibleBands)).toEqual(['alpha', 'gamma']);
    expect(ids(derive(appState({ kind: 'places', places: new Set(['de.berlin']) }, hidden)).visibleBands)).toEqual(['alpha', 'gamma']);
  });

  it('shows only the selected bands, even one the list hides, and leaves the list as it was', () => {
    const derive = createDeriver();
    const state = appState({ kind: 'bands', bandIds: new Set(['beta']) }, hidden);
    const derived = derive(state);
    expect(ids(derived.visibleBands)).toEqual(['beta']);
    expect(ids(derived.visibleShows.map((ref) => ref.band))).toEqual(['beta']);
    expect([...state.hiddenBandIds]).toEqual(['beta']);
    expect(ids(derive(appState(NO_SELECTION, hidden)).visibleBands)).toEqual(['alpha', 'gamma']);
  });
});
