import './styles.css';
import world from 'virtual:world-topology';
import { createDeriver, type AppState } from './appState.ts';
import { addDays, formatIsoDate, localToday, parseIsoDate } from './data/dates.ts';
import type { ShowRef } from './model.ts';
import { createSelectors } from './selectors.ts';
import { createStore } from './state.ts';
import { createBundledStore } from './store/bundled.ts';
import { parseUrlState, serializeUrlState } from './urlState.ts';
import { createBandList } from './view/bandList.ts';
import { createDetail } from './view/detail.ts';
import { h, requireElement } from './view/dom.ts';
import { MAP_SETTINGS, createMapView } from './view/map.ts';
import { createSearch } from './view/search.ts';
import type { SearchEntry } from './view/searchIndex.ts';
import { applyThemePreference, readThemeColors, watchSystemTheme, type ThemeColors, type ThemePreference } from './view/theme.ts';
import { DAY_MS } from './view/timeScale.ts';
import { createTimeline } from './view/timeline.ts';

const WINDOW_DEBOUNCE_MS = 150;
const URL_DEBOUNCE_MS = 300;
const SEARCH_FOCUS_TIMEOUT_MS = 1500;

const dataStore = createBundledStore();
const urlState = parseUrlState(location.hash);
const knownBandIds = new Set(dataStore.listBands().map((file) => file.band.id));

const state = createStore<AppState>({
  bundled: dataStore.listBands(),
  previews: [],
  hiddenBandIds: new Set(urlState.hiddenBandIds.filter((id) => knownBandIds.has(id))),
  bandSort: urlState.sort ?? 'name',
  bandFilter: '',
  focusBandId: null,
  hoverShowIds: new Set(),
  selectedShowIds: new Set(urlState.selectedShowIds),
  timeWindow: null,
  followTimeline: urlState.follow ?? true,
  theme: 'auto',
  today: localToday(new Date()),
});
dataStore.subscribe(() => state.set({ bundled: dataStore.listBands() }));

const derive = createDeriver();
const select = createSelectors(MAP_SETTINGS.maxBandsWithRoutes);
let theme: ThemeColors = readThemeColors('auto');

const idsOf = (shows: readonly ShowRef[] | null): ReadonlySet<string> => new Set((shows ?? []).map((ref) => ref.show.id));

const map = createMapView(requireElement(document, '#map', HTMLDivElement), world, {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selectedShowIds: idsOf(shows) }),
});

let windowTimer: ReturnType<typeof setTimeout> | undefined;
const timeline = createTimeline(requireElement(document, '#timeline', HTMLDivElement), {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selectedShowIds: idsOf(shows) }),
  onWindowChange(window) {
    clearTimeout(windowTimer);
    windowTimer = setTimeout(() => state.set({ timeWindow: window }), WINDOW_DEBOUNCE_MS);
  },
});

const bandList = createBandList(requireElement(document, '#band-list', HTMLElement), {
  onToggle(bandId, visible) {
    const hidden = new Set(state.get().hiddenBandIds);
    if (visible) hidden.delete(bandId);
    else hidden.add(bandId);
    state.set({ hiddenBandIds: hidden });
  },
  onSolo: (bandId) => soloBand(bandId),
  onShowAll: () => state.set({ hiddenBandIds: new Set() }),
  onHideAll: () => state.set({ hiddenBandIds: new Set(derive(state.get()).bands.map((band) => band.file.band.id)) }),
  onFilter: (text) => state.set({ bandFilter: text }),
  onSort: (sort) => state.set({ bandSort: sort }),
  onFocusBand: (bandId) => state.set({ focusBandId: bandId }),
});

const detail = createDetail(requireElement(document, '#detail', HTMLElement), {
  onClear: () => state.set({ selectedShowIds: new Set() }),
});

const search = createSearch(requireElement(document, '#search', HTMLDivElement), { onChoose: focusSearchResult });

const followButton = h('button', { type: 'button', class: 'button button-small', 'aria-pressed': 'true' }, 'Follow timeline');
const fitTimelineButton = h('button', { type: 'button', class: 'button button-small' }, 'Fit timeline');
followButton.addEventListener('click', () => state.set({ followTimeline: !state.get().followTimeline }));
fitTimelineButton.addEventListener('click', () => timeline.fitToData(true));
requireElement(document, '#timeline-controls', HTMLDivElement).append(followButton, fitTimelineButton);
const toolbarHint = requireElement(document, '#toolbar-hint', HTMLParagraphElement);

requireElement(document, '#zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1.6));
requireElement(document, '#zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1 / 1.6));
requireElement(document, '#fit-map', HTMLButtonElement).addEventListener('click', () => map.fitToData(true));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  resetViews();
});

mountThemeSwitch(requireElement(document, '#theme-switch', HTMLFieldSetElement));
watchSystemTheme(() => refreshTheme());

/** After a search, the next follow-timeline refit goes to the chosen shows instead of the whole window. */
let searchFocus: { readonly shows: readonly ShowRef[]; readonly until: number } | null = null;
let previousFitShows: readonly ShowRef[] | null = null;
let previousVisibleBands: readonly unknown[] | null = null;
let restoreWindow = urlState.from !== null && urlState.to !== null ? { from: urlState.from, to: urlState.to } : null;

function renderAll() {
  const current = state.get();
  const derived = derive(current);
  const filter = select.windowFilter(current);
  const fitShows = select.fitShows(derived, filter);

  map.render({
    shows: derived.visibleShows,
    fitShows,
    isInWindow: filter,
    routeBandIds: select.routeBandIds(current, derived),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: current.selectedShowIds,
    focusBandId: current.focusBandId,
    theme,
  });
  if (fitShows !== previousFitShows) {
    const focus = searchFocus !== null && performance.now() < searchFocus.until ? searchFocus.shows : null;
    if (focus === null) map.fitToData(previousFitShows !== null);
    else map.fitToShows(focus, true);
    previousFitShows = fitShows;
  }

  timeline.render({
    lanes: select.lanes(derived),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: current.selectedShowIds,
    focusBandId: current.focusBandId,
    theme,
    today: parseIsoDate(current.today).getTime(),
  });
  if (derived.visibleBands !== previousVisibleBands) {
    const firstRender = previousVisibleBands === null;
    timeline.fitToData(!firstRender);
    previousVisibleBands = derived.visibleBands;
    if (firstRender && restoreWindow !== null) {
      timeline.zoomToRange(parseIsoDate(restoreWindow.from).getTime(), parseIsoDate(restoreWindow.to).getTime() + DAY_MS, false);
      restoreWindow = null;
    }
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
  detail.render({ shows: select.selection(current, derived), mode: theme.mode });
  search.setIndex(select.searchIndex(derived));
  scheduleUrlUpdate();
}

function soloBand(bandId: string) {
  const { bands } = derive(state.get());
  state.set({ hiddenBandIds: new Set(bands.map((band) => band.file.band.id).filter((id) => id !== bandId)) });
}

function focusSearchResult(entry: SearchEntry) {
  const derived = derive(state.get());
  if (entry.kind === 'band') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) soloBand(bandId);
    return;
  }
  const shows = entry.showIds.flatMap((id) => derived.showsById.get(id) ?? []);
  if (shows.length === 0) return;
  if (entry.kind === 'tour') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) soloBand(bandId);
  } else {
    searchFocus = { shows, until: performance.now() + SEARCH_FOCUS_TIMEOUT_MS };
    const { hiddenBandIds } = state.get();
    if (entry.bandIds.some((bandId) => hiddenBandIds.has(bandId))) {
      state.set({ hiddenBandIds: new Set([...hiddenBandIds].filter((bandId) => !entry.bandIds.includes(bandId))) });
    }
    map.fitToShows(shows, true);
  }
  state.set({ selectedShowIds: new Set(entry.showIds) });
  const start = Math.min(...shows.map((ref) => ref.start));
  const end = Math.max(...shows.map((ref) => ref.end)) + DAY_MS;
  const padding = Math.max(7 * DAY_MS, (end - start) * 0.1);
  timeline.zoomToRange(start - padding, end + padding, true);
}

function resetViews() {
  searchFocus = null;
  state.set({ selectedShowIds: new Set(), hoverShowIds: new Set(), focusBandId: null });
  map.fitToData(true);
  timeline.fitToData(true);
}

let urlTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleUrlUpdate() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrlState, URL_DEBOUNCE_MS);
}

function writeUrlState() {
  const current = state.get();
  const window = current.timeWindow;
  const showWindow = window !== null && !timeline.isAtFit();
  const hash = serializeUrlState({
    hiddenBandIds: [...current.hiddenBandIds],
    sort: current.bandSort === 'name' ? null : current.bandSort,
    from: showWindow ? formatIsoDate(new Date(window.start)) : null,
    to: showWindow ? addDays(formatIsoDate(new Date(window.end)), -1) : null,
    selectedShowIds: [...current.selectedShowIds],
    follow: current.followTimeline ? null : false,
  });
  if (hash === location.hash || (hash === '' && location.hash === '')) return;
  const url = `${location.pathname}${location.search}${hash}`;
  try {
    history.replaceState(null, '', url === '' ? location.pathname : url);
  } catch {
    location.replace(hash === '' ? '#' : hash);
  }
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
