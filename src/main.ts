import './styles.css';
import world from 'virtual:world-topology';
import { NO_SELECTION, createDeriver, type AppState, type Derived, type Selection } from './appState.ts';
import { addDays, formatIsoDate, localToday, parseIsoDate } from './data/dates.ts';
import type { ShowRef } from './model.ts';
import { createSelectors } from './selectors.ts';
import { selectionFromUrl, selectionShows, sidebarPanel } from './selection.ts';
import { asDrillDownEntry, drillDownEntry, historyStep } from './drillDownHistory.ts';
import { createStore } from './state.ts';
import { createBundledStore } from './store/bundled.ts';
import { parseUrlState, serializeUrlState } from './urlState.ts';
import { createCountryLocator, type CountryLocator } from './data/countryLocator.ts';
import { isKnownTag } from './data/tags.ts';
import { exportAll, mergePreviews, normalizedFileText, processPreviewFile, type PreviewResult } from './preview.ts';
import { createBandList } from './view/bandList.ts';
import { createPreviewPanel } from './view/previewPanel.ts';
import { h, requireElement } from './view/dom.ts';
import { MAP_SETTINGS, createMapView } from './view/map.ts';
import { createSearch } from './view/search.ts';
import type { SearchEntry } from './view/searchIndex.ts';
import { applyThemePreference, readThemeColors, watchSystemTheme, type ThemeColors, type ThemePreference } from './view/theme.ts';
import { DAY_MS } from './view/timeScale.ts';
import { TIMELINE_SETTINGS, createTimeline } from './view/timeline.ts';
import { FRAME_LAYOUT_QUERY, MAP_SHARE } from './view/layout.ts';
import { createTimelineControls } from './view/timelineControls.ts';
import { createMapControls } from './view/mapControls.ts';
import { createPlaceList } from './view/placeList.ts';
import { createSelectionPanel, type SelectionHeading } from './view/selectionPanel.ts';
import { createSidebar } from './view/sidebar.ts';
import { cityKey, describePlaces, showsAtPlaces, type PlaceKey } from './places.ts';
import { countryName, formatDate, plural } from './view/format.ts';
import { slugify } from './data/ids.ts';
import { findRegion, regionPoints, showsWithin, type MapViewPreset } from './view/mapRegions.ts';
import { PRESET_IDS, defaultPreset, isPresetAvailable, presetRange, usesPastMonth, type TimePreset } from './view/timePresets.ts';

const WINDOW_DEBOUNCE_MS = 150;
const URL_DEBOUNCE_MS = 300;
const SEARCH_FOCUS_TIMEOUT_MS = 1500;

const dataStore = createBundledStore();
const urlState = parseUrlState(location.hash);
const knownBandIds = new Set(dataStore.listBands().map((file) => file.band.id));

const state = createStore<AppState>({
  bundled: dataStore.listBands(),
  previewResults: [],
  previews: [],
  previewsOpen: false,
  hiddenBandIds: new Set(urlState.hiddenBandIds.filter((id) => knownBandIds.has(id))),
  tagFilter: new Set(urlState.tags.filter(isKnownTag)),
  bandSort: urlState.sort ?? 'name',
  bandFilter: '',
  focusBandId: null,
  hoverShowIds: new Set(),
  selection: selectionFromUrl(urlState, knownBandIds),
  timeWindow: null,
  followTimeline: urlState.follow ?? true,
  timePreset: urlState.preset,
  hideEmptyLanes: !urlState.allLanes,
  includePastMonth: urlState.includePastMonth,
  mapView: initialMapView(),
  mapMode: urlState.globe ? 'globe' : 'flat',
  userPosition: null,
  locationStatus: null,
  theme: 'auto',
  today: localToday(new Date()),
});
dataStore.subscribe(() => state.set({ bundled: dataStore.listBands() }));

const derive = createDeriver();
const select = createSelectors(MAP_SETTINGS.maxBandsWithRoutes);
let theme: ThemeColors = readThemeColors('auto');

const idsOf = (shows: readonly ShowRef[] | null): ReadonlySet<string> => new Set((shows ?? []).map((ref) => ref.show.id));
const NO_PLACES: ReadonlySet<PlaceKey> = new Set();
const listFormat = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });
const MAX_NAMED_BANDS = 3;

const map = createMapView(requireElement(document, '#map', HTMLDivElement), world, {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => selectPlaces(new Set(shows.map(cityKey))),
});

const frameLayout = window.matchMedia(FRAME_LAYOUT_QUERY);
const atlas = requireElement(document, '#atlas', HTMLElement);
const atlasToolbar = requireElement(document, '.atlas-toolbar', HTMLElement);

/** In the frame the lanes get what the map leaves; on a scrolling page a share of the window. */
function maxLanesHeight(): number {
  if (!frameLayout.matches) return window.innerHeight * TIMELINE_SETTINGS.maxViewportFraction;
  return atlas.clientHeight * (1 - MAP_SHARE) - atlasToolbar.offsetHeight - TIMELINE_SETTINGS.axisHeight;
}

let windowTimer: ReturnType<typeof setTimeout> | undefined;
const timeline = createTimeline(requireElement(document, '#timeline', HTMLDivElement), {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selection: shows === null || shows.length === 0 ? NO_SELECTION : { kind: 'shows', showIds: idsOf(shows) } }),
  onWindowChange(window, byUser) {
    if (byUser) state.set({ timePreset: null });
    clearTimeout(windowTimer);
    windowTimer = setTimeout(() => state.set({ timeWindow: window }), WINDOW_DEBOUNCE_MS);
  },
  onShowAllLanes: () => state.set({ hideEmptyLanes: false }),
}, { maxLanesHeight });

const bandList = createBandList(requireElement(document, '#band-list', HTMLElement), {
  onSelect(bandId) {
    selectBands(new Set([bandId]));
    selectionPanel.focusTitle();
  },
  onToggle(bandId, visible) {
    const hidden = new Set(state.get().hiddenBandIds);
    if (visible) hidden.delete(bandId);
    else hidden.add(bandId);
    state.set({ hiddenBandIds: hidden });
  },
  onSolo: (bandId) => soloBand(bandId),
  onOpenPreviews: () => state.set({ previewsOpen: true, selection: NO_SELECTION }),
  onListShown() {
    selectBands(new Set(derive(state.get()).visibleBands.map((band) => band.file.band.id)));
    selectionPanel.focusTitle();
  },
  onShowAll: () => state.set({ hiddenBandIds: new Set() }),
  onHideAll: () => state.set({ hiddenBandIds: new Set(derive(state.get()).bands.map((band) => band.file.band.id)) }),
  onFilter: (text) => state.set({ bandFilter: text }),
  onSort: (sort) => state.set({ bandSort: sort }),
  onFocusBand: (bandId) => state.set({ focusBandId: bandId }),
  onToggleTag(tagId) {
    const tags = new Set(state.get().tagFilter);
    if (tags.has(tagId)) tags.delete(tagId);
    else tags.add(tagId);
    state.set({ tagFilter: tags });
  },
  onClearTags: () => state.set({ tagFilter: new Set() }),
});

const selectionPanel = createSelectionPanel(requireElement(document, '#selection-panel', HTMLElement), {
  onBack() {
    state.set({ selection: NO_SELECTION });
    if (!state.get().previewsOpen) sidebar.focusActiveTab();
  },
});

const previewPanel = createPreviewPanel(requireElement(document, '#preview-panel', HTMLElement), {
  onBack() {
    state.set({ previewsOpen: false });
    sidebar.focusActiveTab();
  },
  onDownload: (preview) => {
    const bandId = preview.normalized?.band.id;
    if (bandId === undefined) throw new Error(`${preview.fileName} has nothing to download`);
    downloadText(`${bandId}.json`, normalizedFileText(preview));
  },
  onRemove: (preview) => setPreviews(state.get().previewResults.filter((item) => item !== preview)),
  onClearAll: () => setPreviews([]),
});

const sidebar = createSidebar(requireElement(document, '#sidebar', HTMLElement));
const placeList = createPlaceList(requireElement(document, '#place-list', HTMLElement), {
  onSelect(key) {
    selectPlaces(new Set([key]));
    selectionPanel.focusTitle();
    fitMapTo(showsAtPlaces(derive(state.get()).visibleShows, new Set([key]), state.get().timeWindow));
  },
});

const search = createSearch(requireElement(document, '#search', HTMLDivElement), { onChoose: focusSearchResult });

const timelineControls = createTimelineControls(requireElement(document, '#timeline-controls', HTMLDivElement), {
  onPreset: (preset) => applyPreset(preset, true),
  onIncludePastMonth(include) {
    state.set({ includePastMonth: include });
    const { timePreset } = state.get();
    if (timePreset !== null && usesPastMonth(timePreset)) applyPreset(timePreset, true);
  },
  onHideEmptyLanes: (hide) => state.set({ hideEmptyLanes: hide }),
  onFollowTimeline: (follow) => state.set({ followTimeline: follow }),
  onZoomOut: () => timeline.zoomOut(),
  onShift: (direction) => timeline.shift(direction),
});
const toolbarHint = requireElement(document, '#toolbar-hint', HTMLParagraphElement);

requireElement(document, '#zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1.6));
requireElement(document, '#zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1 / 1.6));
requireElement(document, '#fit-map', HTMLButtonElement).addEventListener('click', () => setMapView({ kind: 'shows' }));

const mapControls = createMapControls(requireElement(document, '#map-controls', HTMLDivElement), {
  onView: (view) => setMapView(view),
  onMode(mode) {
    state.set({ mapMode: mode });
    map.setMode(mode);
    applyMapView(state.get().mapView, false);
  },
  onListNearby() {
    const current = state.get();
    if (current.mapView.kind !== 'near' || current.userPosition === null) return;
    const nearby = showsWithin(select.mapShows(derive(current), select.windowFilter(current)), current.userPosition, current.mapView.radiusKm);
    state.set({ selection: { kind: 'shows', showIds: idsOf(nearby) } });
  },
});
map.setMode(state.get().mapMode);

const fileInput = h('input', { type: 'file', accept: '.json,application/json', multiple: true, class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
document.body.append(fileInput);
requireElement(document, '#preview-button', HTMLButtonElement).addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files !== null) void previewFiles([...fileInput.files]);
  fileInput.value = '';
});
requireElement(document, '#export-button', HTMLButtonElement).addEventListener('click', () => {
  const current = state.get();
  downloadText(`tour-atlas-export-${current.today}.json`, exportAll(current.bundled, current.previewResults));
});
mountDropZone();

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
  const mapShows = select.mapShows(derived, filter);
  const fitShows = mapShows;

  map.render({
    shows: mapShows,
    fitShows: mapShows.length > 0 ? mapShows : derived.visibleShows,
    routeBandIds: select.routeBandIds(current, derived),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: select.selectedIds(current, derived),
    focusBandId: current.focusBandId,
    theme,
  });
  if (fitShows !== previousFitShows && current.mapView.kind !== 'shows') {
    previousFitShows = fitShows;
  } else if (fitShows !== previousFitShows) {
    const focus = searchFocus !== null && performance.now() < searchFocus.until ? searchFocus.shows : null;
    if (focus === null) map.fitToData(previousFitShows !== null);
    else map.fitToShows(focus, true);
    previousFitShows = fitShows;
  }

  const lanes = select.lanes(current, derived);
  timeline.render({
    lanes: lanes.shown,
    domainShows: derived.visibleShows,
    hiddenLaneCount: lanes.hiddenCount,
    emptyMessage:
      derived.visibleBands.length === 0
        ? 'No bands are shown. Turn bands on in the list to see their dates.'
        : 'No shows in this window. Pick another time window or zoom out.',
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: select.selectedIds(current, derived),
    focusBandId: current.focusBandId,
    theme,
    today: parseIsoDate(current.today).getTime(),
  });
  if (derived.visibleBands !== previousVisibleBands) {
    const firstRender = previousVisibleBands === null;
    previousVisibleBands = derived.visibleBands;
    if (firstRender && restoreWindow !== null) {
      timeline.fitToData(false, [parseIsoDate(restoreWindow.from).getTime(), parseIsoDate(restoreWindow.to).getTime() + DAY_MS]);
      restoreWindow = null;
    } else {
      const today = parseIsoDate(current.today).getTime();
      const preset = firstRender ? (current.timePreset ?? defaultPreset(derived.visibleShows, today)) : current.timePreset;
      queueMicrotask(() => applyPreset(preset, !firstRender));
    }
  }

  const today = parseIsoDate(current.today).getTime();
  const nearby =
    current.mapView.kind === 'near' && current.userPosition !== null ? showsWithin(mapShows, current.userPosition, current.mapView.radiusKm) : null;
  mapControls.render({
    view: current.mapView,
    mode: current.mapMode,
    status: current.locationStatus ?? (nearby === null || current.mapView.kind !== 'near' ? null : `${nearby.length === 1 ? '1 show' : `${nearby.length} shows`} within ${current.mapView.radiusKm} km`),
    canListNearby: nearby !== null && nearby.length > 0,
  });

  timelineControls.render({
    preset: state.get().timePreset,
    availablePresets: new Set(PRESET_IDS.filter((preset) => isPresetAvailable(preset, derived.visibleShows, today, current.includePastMonth))),
    includePastMonth: current.includePastMonth,
    hideEmptyLanes: current.hideEmptyLanes,
    followTimeline: current.followTimeline,
  });
  toolbarHint.textContent = timeline.lanesOverflow()
    ? 'Drag across the timeline to zoom in, double-click to zoom out, scroll for more bands'
    : 'Drag across the timeline to zoom in, double-click to zoom out';

  bandList.render({
    bands: derived.filteredBands,
    totalBandCount: derived.bands.length,
    tagFilter: current.tagFilter,
    tagCounts: select.tagCounts(derived),
    hiddenBandIds: current.hiddenBandIds,
    filter: current.bandFilter,
    sort: current.bandSort,
    mode: theme.mode,
    previewCount: current.previewResults.length,
  });
  const selected = select.selection(current, derived);
  const panel = sidebarPanel(current);
  const previewsShown = current.previewsOpen && current.previewResults.length > 0;
  sidebar.show(panel, panel === 'selection' ? selectionKey(current.selection) : panel);
  const listsLabel = sidebar.activeTab() === 'bands' ? 'Back to bands' : 'Back to places';
  if (current.selection.kind !== 'none') {
    selectionPanel.render({
      heading: selectionHeading(current, derived, selected),
      shows: selected,
      showBand: current.selection.kind !== 'bands' || current.selection.bandIds.size > 1,
      backLabel: previewsShown ? 'Back to previewed files' : listsLabel,
      mode: theme.mode,
    });
  }
  placeList.render({ places: select.places(current, derived), selected: current.selection.kind === 'places' ? current.selection.places : NO_PLACES });
  sidebar.setToggleLabel(`Bands and places (${derived.visibleBands.length} of ${derived.bands.length} bands shown)`);
  search.setIndex(select.searchIndex(derived));
  previewPanel.render(current.previewResults, listsLabel);
  scheduleUrlUpdate();
}

let countryLocator: CountryLocator | null = null;

async function previewFiles(files: readonly File[]) {
  const current = state.get();
  const published = new Map(current.bundled.map((file) => [file.band.id, file]));
  countryLocator ??= createCountryLocator(world);
  const options = { today: current.today, locateCountry: countryLocator };
  const results = await Promise.all(
    files.map(async (file) => {
      const text = await file.text();
      const bandId = bandIdHint(text);
      return processPreviewFile(file.name, text, bandId === null ? undefined : published.get(bandId), options);
    }),
  );
  setPreviews(mergePreviews(state.get().previewResults, results));
  state.set({ previewsOpen: true, selection: NO_SELECTION });
}

/** The published version to diff against is looked up by band.id before validation. */
function bandIdHint(text: string): string | null {
  try {
    const json: unknown = JSON.parse(text);
    if (typeof json !== 'object' || json === null || !('band' in json)) return null;
    const band = json.band;
    return typeof band === 'object' && band !== null && 'id' in band && typeof band.id === 'string' ? band.id : null;
  } catch {
    return null;
  }
}

function setPreviews(previewResults: readonly PreviewResult[]) {
  state.set({
    previewResults,
    previews: previewResults.flatMap((preview) => (preview.displayable === null ? [] : [preview.displayable])),
    ...(previewResults.length === 0 ? { previewsOpen: false } : {}),
  });
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: fileName, class: 'visually-hidden' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mountDropZone() {
  const overlay = h('div', { class: 'drop-overlay', hidden: true, 'aria-hidden': 'true' }, h('p', {}, 'Drop band files to preview them'));
  document.body.append(overlay);
  let depth = 0;
  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
  document.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    depth++;
    overlay.hidden = false;
  });
  document.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  });
  document.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.name.endsWith('.json') || file.type === 'application/json');
    if (files.length > 0) void previewFiles(files);
  });
}

function soloBand(bandId: string) {
  const { bands } = derive(state.get());
  state.set({ hiddenBandIds: new Set(bands.map((band) => band.file.band.id).filter((id) => id !== bandId)) });
}

function selectBands(bandIds: ReadonlySet<string>) {
  const { hiddenBandIds, timeWindow } = state.get();
  if ([...bandIds].some((id) => hiddenBandIds.has(id))) state.set({ hiddenBandIds: new Set([...hiddenBandIds].filter((id) => !bandIds.has(id))) });
  sidebar.showTab('bands');
  const selection: Selection = { kind: 'bands', bandIds };
  state.set({ selection });
  fitMapTo(selectionShows(selection, timeWindow, derive(state.get())));
}

function fitMapTo(shows: readonly ShowRef[]) {
  if (shows.length === 0) return;
  state.set({ mapView: { kind: 'shows' } });
  map.setUserLocation(null);
  map.fitToShows(shows, true);
}

function focusSearchResult(entry: SearchEntry) {
  const derived = derive(state.get());
  if (entry.kind === 'band') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) selectBands(new Set([bandId]));
    return;
  }
  if (entry.kind === 'tag') {
    state.set({ tagFilter: new Set([entry.ref]), hiddenBandIds: new Set() });
    return;
  }
  const shows = entry.showIds.flatMap((id) => derived.showsById.get(id) ?? []);
  if (shows.length === 0) return;
  const placeKey = entry.kind === 'place' ? searchPlaceKey(entry.ref) : null;
  if (entry.kind === 'tour') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) soloBand(bandId);
  } else {
    searchFocus = { shows, until: performance.now() + SEARCH_FOCUS_TIMEOUT_MS };
    const { hiddenBandIds } = state.get();
    if (entry.bandIds.some((bandId) => hiddenBandIds.has(bandId))) {
      state.set({ hiddenBandIds: new Set([...hiddenBandIds].filter((bandId) => !entry.bandIds.includes(bandId))) });
    }
    state.set({ mapView: { kind: 'shows' } });
    map.setUserLocation(null);
    map.fitToShows(shows, true);
  }
  state.set({ selection: placeKey === null ? { kind: 'shows', showIds: new Set(entry.showIds) } : { kind: 'places', places: new Set([placeKey]) }, timePreset: null });
  const start = Math.min(...shows.map((ref) => ref.start));
  const end = Math.max(...shows.map((ref) => ref.end)) + DAY_MS;
  const padding = Math.max(7 * DAY_MS, (end - start) * 0.1);
  timeline.zoomToRange(start - padding, end + padding, true);
}

/** Null keeps a custom window's behaviour: fit everything. Unavailable presets fall back to all dates. */
function applyPreset(preset: TimePreset | null, animate: boolean) {
  const current = state.get();
  const shows = derive(current).visibleShows;
  const today = parseIsoDate(current.today).getTime();
  if (preset === null || !isPresetAvailable(preset, shows, today, current.includePastMonth)) {
    if (preset !== null) state.set({ timePreset: 'all' });
    timeline.fitToData(animate, null);
    return;
  }
  state.set({ timePreset: preset });
  timeline.fitToData(animate, presetRange(preset, shows, today, current.includePastMonth));
}

function selectPlaces(places: ReadonlySet<PlaceKey>) {
  state.set({ selection: places.size === 0 ? NO_SELECTION : { kind: 'places', places } });
}

/** Changes when a different selection opens, so the sidebar starts it at the top. */
function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    case 'none':
      return 'none';
    case 'shows':
      return `shows:${[...selection.showIds].toSorted().join(',')}`;
    case 'places':
      return `places:${[...selection.places].toSorted().join(',')}`;
    case 'bands':
      return `bands:${[...selection.bandIds].toSorted().join(',')}`;
  }
}

/** Search keys places as "<city slug>|<COUNTRY>". */
function searchPlaceKey(ref: string): PlaceKey {
  const [city, country] = ref.split('|');
  if (city === undefined || country === undefined) throw new Error(`unexpected place reference ${ref}`);
  return `${country.toLowerCase()}.${slugify(city)}`;
}

function selectionHeading(current: AppState, derived: Derived, shows: readonly ShowRef[]): SelectionHeading {
  const window = current.timeWindow;
  const range = window === null ? 'on all dates' : `between ${formatDate(formatIsoDate(new Date(window.start)))} and ${formatDate(formatIsoDate(new Date(window.end)))}`;
  const live = `${plural(shows.length, 'show')} ${range}. The list follows the timeline.`;
  const { selection } = current;
  switch (selection.kind) {
    case 'none':
      throw new Error('no selection to describe');
    case 'bands': {
      const names = derived.bands.filter((entry) => selection.bandIds.has(entry.file.band.id)).map((entry) => entry.file.band.name);
      if (names.length !== selection.bandIds.size) throw new Error(`unknown band in ${[...selection.bandIds].join(', ')}`);
      const [onlyBandId] = selection.bandIds;
      const title = names.length <= MAX_NAMED_BANDS ? listFormat.format(names) : plural(names.length, 'band');
      const subject = names.length === 1 ? `${title} shows` : 'shows of these bands';
      return {
        title,
        bandId: names.length === 1 && onlyBandId !== undefined ? onlyBandId : null,
        note: live,
        emptyMessage: `No ${subject} ${range}. Zoom the timeline out or pick a wider time range.`,
      };
    }
    case 'places': {
      const name = describePlaces(selection.places, derived.visibleShows, countryName);
      return { title: name, bandId: null, note: live, emptyMessage: `No shows in ${name} ${range}. Zoom the timeline out or pick a wider time range.` };
    }
    case 'shows':
      return { title: pickedShowsTitle(shows), bandId: null, note: null, emptyMessage: 'These shows are hidden. Turn their bands on in the band list.' };
  }
}

function pickedShowsTitle(shows: readonly ShowRef[]): string {
  const cities = new Set(shows.map((ref) => ref.show.city));
  const bands = new Set(shows.map((ref) => ref.band.file.band.name));
  const [onlyCity] = cities;
  const [onlyBand] = bands;
  if (shows.length === 1 && onlyBand !== undefined && onlyCity !== undefined) return `${onlyBand} in ${onlyCity}`;
  const where = cities.size === 1 && onlyCity !== undefined ? `in ${onlyCity}` : `in ${plural(cities.size, 'city', 'cities')}`;
  return `${bands.size === 1 && onlyBand !== undefined ? `${onlyBand}: ` : ''}${plural(shows.length, 'show')} ${where}`;
}

function initialMapView(): MapViewPreset {
  const region = urlState.region === null ? undefined : findRegion(urlState.region);
  return region === undefined ? { kind: 'shows' } : { kind: 'region', region };
}

function setMapView(view: MapViewPreset) {
  const previous = state.get().mapView;
  state.set({ mapView: view, locationStatus: null });
  if (view.kind !== 'near') {
    applyMapView(view, true);
    return;
  }
  if (!('geolocation' in navigator)) {
    state.set({ mapView: previous, locationStatus: "This browser can't share its location here. Pick a region instead." });
    return;
  }
  const known = state.get().userPosition;
  if (known !== null) {
    applyMapView(view, true);
    return;
  }
  state.set({ locationStatus: 'Asking the browser for your location…' });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.set({ userPosition: [position.coords.longitude, position.coords.latitude], locationStatus: null });
      applyMapView(state.get().mapView, true);
    },
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? 'Location access was denied. Allow it in the browser or pick a region.'
          : 'Your location could not be determined. Pick a region instead.';
      state.set({ mapView: previous, locationStatus: message });
      applyMapView(previous, true);
    },
    { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
  );
}

function applyMapView(view: MapViewPreset, animate: boolean) {
  const { userPosition } = state.get();
  if (view.kind === 'near' && userPosition !== null) {
    map.setUserLocation({ lon: userPosition[0], lat: userPosition[1], radiusKm: view.radiusKm });
    map.fitToPoints([userPosition], view.radiusKm * 2, animate);
    return;
  }
  map.setUserLocation(null);
  if (view.kind === 'region') map.fitToPoints(regionPoints(view.region), 300, animate);
  else map.fitToData(animate);
}

function resetViews() {
  searchFocus = null;
  const current = state.get();
  state.set({ selection: NO_SELECTION, hoverShowIds: new Set(), focusBandId: null, mapView: { kind: 'shows' }, locationStatus: null });
  map.setUserLocation(null);
  map.fitToData(true);
  applyPreset(defaultPreset(derive(current).visibleShows, parseIsoDate(current.today).getTime()), true);
}

let urlTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleUrlUpdate() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrlState, URL_DEBOUNCE_MS);
}

function writeUrlState() {
  const hash = currentHash();
  if (hash === location.hash || (hash === '' && location.hash === '')) return;
  const url = `${location.pathname}${location.search}${hash}`;
  try {
    history.replaceState(history.state, '', url === '' ? location.pathname : url);
  } catch {
    location.replace(hash === '' ? '#' : hash);
  }
}

function currentHash(): string {
  const current = state.get();
  const window = current.timeWindow;
  const showWindow = window !== null && current.timePreset === null && !timeline.isAtFit();
  return serializeUrlState({
    hiddenBandIds: [...current.hiddenBandIds],
    tags: [...current.tagFilter],
    sort: current.bandSort === 'name' ? null : current.bandSort,
    from: showWindow ? formatIsoDate(new Date(window.start)) : null,
    to: showWindow ? addDays(formatIsoDate(new Date(window.end)), -1) : null,
    selectedShowIds: current.selection.kind === 'shows' ? [...current.selection.showIds] : [],
    selectedPlaces: current.selection.kind === 'places' ? [...current.selection.places] : [],
    selectedBandIds: current.selection.kind === 'bands' ? [...current.selection.bandIds] : [],
    follow: current.followTimeline ? null : false,
    preset: current.timePreset === null || current.timePreset === defaultPreset(derive(current).visibleShows, parseIsoDate(current.today).getTime()) ? null : current.timePreset,
    allLanes: !current.hideEmptyLanes,
    includePastMonth: current.includePastMonth,
    region: current.mapView.kind === 'region' ? current.mapView.region.id : null,
    globe: current.mapMode === 'globe',
  });
}

/** Drill-downs get their own history entry, so browser Back (and the mouse's back button) returns to the lists. */
function mountDrillDownHistory() {
  let applyingHistory = false;
  let previousPanel = sidebarPanel(state.get());
  const writeEntry = (method: 'pushState' | 'replaceState', entry: unknown, hash: string) => {
    try {
      history[method](entry, '', `${location.pathname}${location.search}${hash}`);
    } catch {
      return;
    }
  };

  if (previousPanel !== 'lists') {
    const sharedHash = location.hash;
    writeEntry('replaceState', null, serializeUrlState({ ...urlState, selectedShowIds: [], selectedPlaces: [], selectedBandIds: [] }));
    writeEntry('pushState', drillDownEntry(previousPanel), sharedHash);
  }

  state.subscribe((current) => {
    const panel = sidebarPanel(current);
    const step = applyingHistory ? 'none' : historyStep(previousPanel, panel, asDrillDownEntry(history.state) !== null);
    previousPanel = panel;
    if (step === 'push') writeEntry('pushState', drillDownEntry(panel), currentHash());
    else if (step === 'replace') writeEntry('replaceState', drillDownEntry(panel), currentHash());
    else if (step === 'back') history.back();
  });

  window.addEventListener('popstate', () => {
    applyingHistory = true;
    try {
      const entry = asDrillDownEntry(history.state);
      state.set({ selection: selectionFromUrl(parseUrlState(location.hash), knownBandIds), previewsOpen: entry?.previews === true });
    } finally {
      applyingHistory = false;
    }
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
mountDrillDownHistory();
renderAll();
