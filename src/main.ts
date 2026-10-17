import './styles.css';
import world from 'virtual:world-topology';
import { createDeriver, isInWindow, type AppState, type Derived } from './appState.ts';
import { localToday } from './data/dates.ts';
import type { ShowRef } from './model.ts';
import { createStore } from './state.ts';
import { createBundledStore } from './store/bundled.ts';
import { createBandList } from './view/bandList.ts';
import { h, requireElement } from './view/dom.ts';
import { MAP_SETTINGS, createMapView, type MapProps } from './view/map.ts';
import { createTimeline, type TimelineLane } from './view/timeline.ts';
import { parseIsoDate } from './data/dates.ts';
import { applyThemePreference, readThemeColors, watchSystemTheme, type ThemeColors, type ThemePreference } from './view/theme.ts';

const dataStore = createBundledStore();
const state = createStore<AppState>({
  bundled: dataStore.listBands(),
  previews: [],
  hiddenBandIds: new Set(),
  bandSort: 'name',
  bandFilter: '',
  focusBandId: null,
  hoverShowIds: new Set(),
  selectedShowIds: new Set(),
  timeWindow: null,
  followTimeline: true,
  theme: 'auto',
  today: localToday(new Date()),
});
dataStore.subscribe(() => state.set({ bundled: dataStore.listBands() }));

const derive = createDeriver();
let theme: ThemeColors = readThemeColors('auto');

const idsOf = (shows: readonly ShowRef[] | null): ReadonlySet<string> => new Set((shows ?? []).map((ref) => ref.show.id));

const map = createMapView(requireElement(document, '#map', HTMLDivElement), world, {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selectedShowIds: idsOf(shows) }),
});

const bandList = createBandList(requireElement(document, '#band-list', HTMLElement), {
  onToggle(bandId, visible) {
    const hidden = new Set(state.get().hiddenBandIds);
    if (visible) hidden.delete(bandId);
    else hidden.add(bandId);
    state.set({ hiddenBandIds: hidden });
  },
  onSolo(bandId) {
    const { bands } = derive(state.get());
    state.set({ hiddenBandIds: new Set(bands.map((band) => band.file.band.id).filter((id) => id !== bandId)) });
  },
  onShowAll: () => state.set({ hiddenBandIds: new Set() }),
  onHideAll: () => state.set({ hiddenBandIds: new Set(derive(state.get()).bands.map((band) => band.file.band.id)) }),
  onFilter: (text) => state.set({ bandFilter: text }),
  onSort: (sort) => state.set({ bandSort: sort }),
  onFocusBand: (bandId) => state.set({ focusBandId: bandId }),
});

const WINDOW_DEBOUNCE_MS = 150;
let windowTimer: number | undefined;

const timeline = createTimeline(requireElement(document, '#timeline', HTMLDivElement), {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selectedShowIds: idsOf(shows) }),
  onWindowChange(window) {
    clearTimeout(windowTimer);
    windowTimer = setTimeout(() => state.set({ timeWindow: window }), WINDOW_DEBOUNCE_MS);
  },
});

const followButton = h('button', { type: 'button', class: 'button button-small', 'aria-pressed': 'true' }, 'Follow timeline');
const fitTimelineButton = h('button', { type: 'button', class: 'button button-small' }, 'Fit timeline');
followButton.addEventListener('click', () => state.set({ followTimeline: !state.get().followTimeline }));
fitTimelineButton.addEventListener('click', () => timeline.fitToData(true));
requireElement(document, '#timeline-controls', HTMLDivElement).append(followButton, fitTimelineButton);
const toolbarHint = requireElement(document, '#toolbar-hint', HTMLParagraphElement);

requireElement(document, '#zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1.6));
requireElement(document, '#zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1 / 1.6));
requireElement(document, '#fit-map', HTMLButtonElement).addEventListener('click', () => map.fitToData(true));

mountThemeSwitch(requireElement(document, '#theme-switch', HTMLFieldSetElement));
watchSystemTheme(() => refreshTheme());

let routeKey = '';
let routeBandIds: ReadonlySet<string> = new Set();

function routesFor(current: AppState, derived: Derived): ReadonlySet<string> {
  const ids =
    derived.visibleBands.length <= MAP_SETTINGS.maxBandsWithRoutes
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
}

let windowFilter: ((ref: ShowRef) => boolean) | null = null;
let windowFilterKey: AppState['timeWindow'] = null;

function windowFilterFor(current: AppState): ((ref: ShowRef) => boolean) | null {
  const window = current.followTimeline ? current.timeWindow : null;
  if (window !== windowFilterKey) {
    windowFilterKey = window;
    windowFilter = window === null ? null : (ref) => isInWindow(ref, window);
  }
  return windowFilter;
}

let lastFitShows: readonly ShowRef[] | null = null;
let lastFitSource: [readonly ShowRef[], ((ref: ShowRef) => boolean) | null] | null = null;

function fitShowsFor(derived: Derived, filter: ((ref: ShowRef) => boolean) | null): readonly ShowRef[] {
  if (lastFitSource !== null && lastFitSource[0] === derived.visibleShows && lastFitSource[1] === filter && lastFitShows !== null) {
    return lastFitShows;
  }
  const inWindow = filter === null ? derived.visibleShows : derived.visibleShows.filter(filter);
  lastFitSource = [derived.visibleShows, filter];
  lastFitShows = inWindow.length > 0 ? inWindow : derived.visibleShows;
  return lastFitShows;
}

let previousFitShows: readonly ShowRef[] | null = null;
let previousVisibleBands: readonly unknown[] | null = null;
let lanesKey: Derived['visibleBands'] | null = null;
let lanes: readonly TimelineLane[] = [];

function lanesFor(derived: Derived): readonly TimelineLane[] {
  if (derived.visibleBands !== lanesKey) {
    lanesKey = derived.visibleBands;
    lanes = derived.visibleBands.map((band) => ({ band, shows: derived.refsByBand.get(band) ?? [] }));
  }
  return lanes;
}

function renderAll() {
  const current = state.get();
  const derived = derive(current);
  const filter = windowFilterFor(current);
  const fitShows = fitShowsFor(derived, filter);

  const mapProps: MapProps = {
    shows: derived.visibleShows,
    fitShows,
    isInWindow: filter,
    routeBandIds: routesFor(current, derived),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: current.selectedShowIds,
    focusBandId: current.focusBandId,
    theme,
  };
  map.render(mapProps);
  if (fitShows !== previousFitShows) {
    map.fitToData(previousFitShows !== null);
    previousFitShows = fitShows;
  }

  timeline.render({
    lanes: lanesFor(derived),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: current.selectedShowIds,
    focusBandId: current.focusBandId,
    theme,
    today: parseIsoDate(current.today).getTime(),
  });
  if (derived.visibleBands !== previousVisibleBands) {
    timeline.fitToData(previousVisibleBands !== null);
    previousVisibleBands = derived.visibleBands;
  }

  followButton.setAttribute('aria-pressed', String(current.followTimeline));
  toolbarHint.textContent = timeline.lanesOverflow()
    ? 'Scroll to zoom the timeline, drag to pan, Shift + scroll for more bands'
    : 'Scroll to zoom the timeline, drag to pan';

  bandList.render({
    bands: derived.orderedBands,
    hiddenBandIds: current.hiddenBandIds,
    filter: current.bandFilter,
    sort: current.bandSort,
    mode: theme.mode,
  });
}

function refreshTheme() {
  theme = readThemeColors(state.get().theme);
  renderAll();
}

function mountThemeSwitch(fieldset: HTMLFieldSetElement) {
  const options: [ThemePreference, string][] = [
    ['auto', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  for (const [value, label] of options) {
    const input = h('input', { type: 'radio', name: 'theme', value, checked: value === state.get().theme });
    input.addEventListener('change', () => {
      if (!input.checked) return;
      applyThemePreference(value);
      state.set({ theme: value });
      refreshTheme();
    });
    fieldset.append(h('label', {}, input, label));
  }
}

state.subscribe(renderAll);
renderAll();
