import { startup } from './startup.ts';
import './styles.css';
import world from 'virtual:world-topology';
import { NO_SELECTION, activeArea, createDeriver, sameWindow, showsInArea, soloBandIds, type AppState, type Area, type Derived, type Selection, type TimeWindow } from './appState.ts';
import { addDays, formatIsoDate, localToday, parseIsoDate } from './data/dates.ts';
import type { ShowRef } from './model.ts';
import { createSelectors } from './selectors.ts';
import { selectionFromUrl, selectionShows, sidebarPanel } from './selection.ts';
import { createTourClock } from './view/tourClock.ts';
import { HOME_ENTRY, asDrillDownEntry, drillDownEntry, historyStep, isHomeEntry } from './drillDownHistory.ts';
import { createStore } from './state.ts';
import { createBundledStore } from './store/bundled.ts';
import { aroundOf, mapViewFromUrl, parseUrlState, serializeUrlState, type UrlState } from './urlState.ts';
import { createCountryLocator, type CountryLocator } from './data/countryLocator.ts';
import { NO_GENRE, TAG_VOCABULARY } from './data/tags.ts';
import { exportAll, mergePreviews, normalizedFileText, processPreviewFile, type PreviewResult } from './preview.ts';
import { createBandList } from './view/bandList.ts';
import { createPreviewPanel } from './view/previewPanel.ts';
import { closesSelectList, h, prefersReducedMotion, requireElement } from './view/dom.ts';
import { MAP_SETTINGS, createMapView } from './view/map.ts';
import { createSearch } from './view/search.ts';
import type { SearchEntry } from './view/searchIndex.ts';
import { applyStyle, applyThemeColor, applyThemePreference, readThemeTokens, watchSystemTheme, type ThemeTokens } from './view/theme.ts';
import { DAY_MS } from './view/timeScale.ts';
import { TIMELINE_SETTINGS, createTimeline, fitDomain } from './view/timeline.ts';
import { FRAME_LAYOUT_QUERY, MAP_SHARE, PHONE_LAYOUT_QUERY, PHONE_MAP_SHARE } from './view/layout.ts';
import { createTimelineControls } from './view/timelineControls.ts';
import { IOS_ZOOM_GUARD_CLASS, needsIosZoomGuard } from './view/iosZoomGuard.ts';
import { createMapControls } from './view/mapControls.ts';
import { createSettings } from './view/settings.ts';
import { createSharePanel } from './view/sharePanel.ts';
import { shareCapabilities, shareLink, shareText } from './share.ts';
import { icon } from './view/icons.ts';
import { createPlaceList } from './view/placeList.ts';
import { createGenreList } from './view/genreList.ts';
import { createSelectionPanel, type SelectionHeading } from './view/selectionPanel.ts';
import { createSidebar } from './view/sidebar.ts';
import { createBottomSheet } from './view/sheet.ts';
import { cityKey, describePlaces, showsAtPlaces, type PlaceKey } from './places.ts';
import { countryName, formatDate, formatList } from './view/format.ts';
import { localeChoice, t, useLocale } from './i18n/index.ts';
import { localizePage } from './i18n/page.ts';
import type { LocaleChoice } from './i18n/locale.ts';
import { slugify } from './data/ids.ts';
import { kilometres, regionPoints, type AreaCircle, type Distance, type MapViewPreset } from './view/mapRegions.ts';
import { pointView } from './view/aroundPoint.ts';
import type { LonLat } from './view/geoFit.ts';
import { PRESET_IDS, defaultPreset, isPresetAvailable, presetWindow, usesPastMonth, windowAfterFilterChange, type TimePreset } from './view/timePresets.ts';

const WINDOW_DEBOUNCE_MS = 150;
const URL_DEBOUNCE_MS = 300;
const SEARCH_FOCUS_TIMEOUT_MS = 1500;

const urlState = parseUrlState(location.hash);
useLocale({ language: urlState.language, clock: urlState.clock, distance: urlState.distance }, navigator.languages);
localizePage(document);
applyStyle(urlState.style);
if (needsIosZoomGuard((property, value) => CSS.supports(property, value))) document.documentElement.classList.add(IOS_ZOOM_GUARD_CLASS);

const dataStore = createBundledStore();
const knownBandIds = new Set(dataStore.listBands().map((file) => file.band.id));

const state = createStore<AppState>({
  bundled: dataStore.listBands(),
  previewResults: [],
  previews: [],
  previewsOpen: false,
  hiddenBandIds: new Set(urlState.hiddenBandIds.filter((id) => knownBandIds.has(id))),
  tagFilter: new Set(urlState.tags.filter(isGenreId)),
  bandSort: urlState.sort ?? 'name',
  bandFilter: '',
  focusBandId: null,
  hoverShowIds: new Set(),
  selection: selectionFromUrl(urlState, knownBandIds, isGenreId),
  timeWindow: null,
  followTimeline: urlState.follow ?? true,
  timePreset: urlState.preset,
  hideEmptyLanes: !urlState.allLanes,
  includePastMonth: urlState.includePastMonth,
  tourPacing: urlState.tourPacing,
  mapView: mapViewFromUrl(urlState),
  pickRadius: null,
  mapMode: urlState.globe ? 'globe' : 'flat',
  userPosition: null,
  locationStatus: null,
  style: urlState.style,
  theme: 'auto',
  today: localToday(new Date()),
});
dataStore.subscribe(() => state.set({ bundled: dataStore.listBands() }));

const derive = createDeriver();
const select = createSelectors(MAP_SETTINGS.maxBandsWithRoutes);
let theme: ThemeTokens = readThemeTokens('auto');
applyThemeColor(theme.panel);

const idsOf = (shows: readonly ShowRef[] | null): ReadonlySet<string> => new Set((shows ?? []).map((ref) => ref.show.id));
const NO_PLACES: ReadonlySet<PlaceKey> = new Set();
const NO_BANDS: ReadonlySet<string> = new Set();
const MAX_NAMED_BANDS = 3;

const map = createMapView(requireElement(document, '#map', HTMLDivElement), world, {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => selectPlaces(new Set(shows.map(cityKey))),
  onUserMove: () => stopTour(),
  onPickPoint(point) {
    const radius = state.get().pickRadius;
    if (radius === null) throw new Error('a point was picked without a radius to pick it for');
    setAroundPoint(point, radius);
  },
  onPointMenu: (point, clientX, clientY, byTouch) => mapControls.openPointMenu(point, clientX, clientY, byTouch),
});

const frameLayout = window.matchMedia(FRAME_LAYOUT_QUERY);
const phoneLayout = window.matchMedia(PHONE_LAYOUT_QUERY);
const atlas = requireElement(document, '#atlas', HTMLElement);
const atlasToolbar = requireElement(document, '#timeline-controls', HTMLElement);
const stage = requireElement(document, '.stage', HTMLElement);

/**
 * In the frame the lanes get what the map leaves; on a scrolling page a share of the window. Above the phone's
 * sheet they share the stage, which scrolls when the window is too short for the map and the fewest lanes.
 */
function maxLanesHeight(): number {
  if (phoneLayout.matches) {
    const { paddingTop, paddingBottom } = getComputedStyle(stage);
    const room = stage.clientHeight - Number.parseFloat(paddingTop) - Number.parseFloat(paddingBottom);
    return room * (1 - PHONE_MAP_SHARE) - atlasToolbar.offsetHeight - TIMELINE_SETTINGS.axisHeight;
  }
  if (!frameLayout.matches) return window.innerHeight * TIMELINE_SETTINGS.maxViewportFraction;
  return atlas.clientHeight * (1 - MAP_SHARE) - atlasToolbar.offsetHeight - TIMELINE_SETTINGS.axisHeight;
}

let windowTimer: ReturnType<typeof setTimeout> | undefined;
const timeline = createTimeline(requireElement(document, '#timeline', HTMLDivElement), {
  onHover: (shows) => state.set({ hoverShowIds: idsOf(shows) }),
  onSelect: (shows) => state.set({ selection: shows === null || shows.length === 0 ? NO_SELECTION : { kind: 'shows', showIds: idsOf(shows) } }),
  onWindowChange(window, byUser) {
    clearTimeout(windowTimer);
    if (!byUser) {
      // A programmatic fit reports its target before it moves; a microtask keeps it out of a render in progress.
      queueMicrotask(() => setTimeWindow(window));
      return;
    }
    state.set({ timePreset: null });
    windowTimer = setTimeout(() => setTimeWindow(window), WINDOW_DEBOUNCE_MS);
  },
  onShowAllLanes: () => state.set({ hideEmptyLanes: false }),
}, { maxLanesHeight, fillsMaxHeight: () => phoneLayout.matches });

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
  onClearTags: () => state.set({ tagFilter: new Set() }),
});

const selectionPanel = createSelectionPanel(requireElement(document, '#selection-panel', HTMLElement), {
  onBack() {
    state.set({ selection: NO_SELECTION });
  },
  onHover: (ref) => state.set({ hoverShowIds: ref === null ? new Set() : new Set([ref.show.id]) }),
  onReplayTour: () => playTour(),
  onAroundHere(radius) {
    const place = select.selectionPlace(state.get(), derive(state.get()));
    if (place === null) throw new Error('the selection has no single place to centre an area on');
    setAroundPoint(place, radius);
  },
});

const previewPanel = createPreviewPanel(requireElement(document, '#preview-panel', HTMLElement), {
  onBack() {
    state.set({ previewsOpen: false });
  },
  onDownload: (preview) => {
    const bandId = preview.normalized?.band.id;
    if (bandId === undefined) throw new Error(`${preview.fileName} has nothing to download`);
    downloadText(`${bandId}.json`, normalizedFileText(preview));
  },
  onRemove: (preview) => setPreviews(state.get().previewResults.filter((item) => item !== preview)),
  onClearAll: () => setPreviews([]),
});

const sidebarElement = requireElement(document, '#sidebar', HTMLElement);
const sheetHandle = requireElement(sidebarElement, '#sidebar-toggle', HTMLButtonElement);
const sidebar = createSidebar(sidebarElement, { handle: sheetHandle, hasSheet: () => phoneLayout.matches });
const sheet = createBottomSheet(
  {
    sheet: sidebarElement,
    handle: sheetHandle,
    body: requireElement(sidebarElement, '#sidebar-body', HTMLElement),
    ceiling: requireElement(document, '.masthead', HTMLElement),
    stage,
    mapFrame: requireElement(document, '.map-frame', HTMLElement),
    mapControls: requireElement(document, '#map-controls', HTMLElement),
    risers: [requireElement(document, '#map-status', HTMLElement)],
    tail: requireElement(document, '.colophon', HTMLElement),
  },
  phoneLayout,
  {
    onMapCover: (pixels) => map.setHiddenBottom(pixels),
    onRest(height) {
      if (height === 'half') map.uncoverPins();
    },
  },
);
const placeList = createPlaceList(requireElement(document, '#place-list', HTMLElement), {
  onSelect(key) {
    selectPlaces(new Set([key]));
    selectionPanel.focusTitle();
    fitMapTo(showsAtPlaces(derive(state.get()).visibleShows, new Set([key]), state.get().timeWindow));
  },
});

const genreList = createGenreList(requireElement(document, '#genre-list', HTMLElement), {
  onToggle(genreId) {
    const tags = new Set(state.get().tagFilter);
    if (tags.has(genreId)) tags.delete(genreId);
    else tags.add(genreId);
    state.set({ tagFilter: tags });
  },
  onClearChecked: () => state.set({ tagFilter: new Set() }),
  onSelect(genreId) {
    selectGenre(genreId);
    selectionPanel.focusTitle();
  },
});

const search = createSearch(requireElement(document, '#search', HTMLDivElement), { onChoose: focusSearchResult });

const timelineControls = createTimelineControls(requireElement(document, '#timeline-controls', HTMLDivElement), {
  onPreset: (preset) => applyPreset(preset, true),
  onZoomOut: () => timeline.zoomOut(),
  onShift: (direction) => timeline.shift(direction),
  onFollowTimeline: (follow) => state.set({ followTimeline: follow }),
  onHideEmptyLanes: (hide) => state.set({ hideEmptyLanes: hide }),
  onIncludePastMonth(include) {
    state.set({ includePastMonth: include });
    const { timePreset } = state.get();
    if (timePreset !== null && usesPastMonth(timePreset)) applyPreset(timePreset, true);
  },
  onTourPacing(pacing) {
    state.set({ tourPacing: pacing });
    playTour();
  },
});

const mapControls = createMapControls(requireElement(document, '#map-controls', HTMLDivElement), requireElement(document, '#map-status', HTMLDivElement), {
  onZoom(factor) {
    stopTour();
    map.zoomBy(factor);
  },
  onFit() {
    stopTour();
    fitToScope();
  },
  onView(view) {
    stopTour();
    setMapView(view);
  },
  onMode(mode) {
    stopTour();
    state.set({ mapMode: mode });
    map.setMode(mode);
    applyMapView(state.get().mapView, false);
  },
  onListNearby() {
    if (derive(state.get()).area === null) throw new Error('there is no area to list the shows of');
    state.set({ selection: { kind: 'nearby' } });
  },
  onAroundPoint(radius) {
    const { mapView } = state.get();
    if (mapView.kind === 'point') setAroundPoint(mapView.center, radius);
    else startPicking(radius);
  },
  onPickAnother() {
    const { mapView } = state.get();
    if (mapView.kind !== 'point') throw new Error('there is no picked point to replace');
    startPicking(mapView.radius);
  },
  onCancelPick: () => state.set({ pickRadius: null }),
  onClearArea() {
    stopTour();
    setMapView({ kind: 'shows' });
  },
  onAroundHere: (point, radius) => setAroundPoint(point, radius),
});
map.setMode(state.get().mapMode);
applyMapView(state.get().mapView, false);

const fileInput = h('input', { type: 'file', accept: '.json,application/json', multiple: true, class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
document.body.append(fileInput);
fileInput.addEventListener('change', () => {
  if (fileInput.files !== null) void previewFiles([...fileInput.files]);
  fileInput.value = '';
});
mountDropZone();

const shareButton = requireElement(document, '#share-button', HTMLButtonElement);
shareButton.append(icon('share'));
createSharePanel(shareButton, requireElement(document, '#share-panel', HTMLDivElement), {
  currentView() {
    const current = state.get();
    const derived = derive(current);
    const heading = current.selection.kind === 'none' ? null : selectionHeading(current, derived, select.selection(current, derived)).title;
    return { url: shareLink(location.href, currentHash()), title: shareText(heading) };
  },
}, shareCapabilities(navigator));

requireElement(document, '#source-link', HTMLAnchorElement).append(icon('github'));
const settingsButton = requireElement(document, '#settings-button', HTMLButtonElement);
settingsButton.append(icon('gear'));
const settings = createSettings(settingsButton, requireElement(document, '#settings-panel', HTMLDivElement), {
  onStyle(style) {
    applyStyle(style);
    state.set({ style });
    refreshTheme();
  },
  onTheme(preference) {
    applyThemePreference(preference);
    state.set({ theme: preference });
    refreshTheme();
  },
  onLanguage: (language) => reloadWithLocale({ ...localeChoice(), language }),
  onClock: (clock) => reloadWithLocale({ ...localeChoice(), clock }),
  onDistance: (distance) => reloadWithLocale({ ...localeChoice(), distance }),
  onPreviewFiles: () => fileInput.click(),
  onExportAll() {
    const current = state.get();
    downloadText(`tour-atlas-export-${current.today}.json`, exportAll(current.bundled, current.previewResults));
  },
}, localeChoice(), navigator.languages);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || closesSelectList(event)) return;
  if (state.get().pickRadius !== null) state.set({ pickRadius: null });
  // On phones a first Escape closes the drill-down, the next one the sheet.
  else if (sidebarPanel(state.get()) !== 'lists' || !sheet.close()) resetViews();
});

watchSystemTheme(() => refreshTheme());
// Canvas text is drawn once; redraw when a style's font arrives.
document.fonts.addEventListener('loadingdone', () => refreshTheme());

/** After a search, the next follow-timeline refit goes to the chosen shows instead of the whole window. */
let searchFocus: { readonly shows: readonly ShowRef[]; readonly until: number } | null = null;
let previousFitShows: readonly ShowRef[] | null = null;
let previousVisibleBands: readonly unknown[] | null = null;
let previousArea: Area | null = null;
let previousSolo: ReadonlySet<string> | null = null;
let restoreWindow = urlState.from !== null && urlState.to !== null ? { from: urlState.from, to: urlState.to } : null;

function renderAll() {
  const current = state.get();
  const derived = derive(current);
  const firstRender = previousVisibleBands === null;
  const filter = select.windowFilter(current);
  const mapShows = select.mapShows(derived, filter);
  const fitShows = mapShows;

  map.render({
    shows: mapShows,
    fitShows: mapShows.length > 0 ? mapShows : derived.visibleShows,
    routeBandIds: select.routeBandIds(current, derived),
    emphasizedBandIds: soloBandIds(current.selection) ?? NO_BANDS,
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

  map.setPicking(current.pickRadius !== null);
  const areaWithin = select.areaWithin(current, derived);
  const lanes = select.lanes(current, derived);
  timeline.render({
    lanes: lanes.shown,
    domainShows: derived.visibleShows,
    hiddenLaneCount: lanes.hiddenCount,
    areaWithin,
    emptyMessage:
      derived.visibleBands.length === 0
        ? t().timeline.noBandsShown
        : areaWithin === null
          ? t().timeline.noShowsInWindow
          : t().timeline.noShowsInWindowNear(areaWithin),
    highlightedShowIds: current.hoverShowIds,
    selectedShowIds: select.selectedIds(current, derived),
    focusBandId: current.focusBandId,
    theme,
    today: parseIsoDate(current.today).getTime(),
    clearGutter: current.timePreset !== null && usesPastMonth(current.timePreset),
  });
  const solo = soloBandIds(current.selection);
  const soloChanged = solo !== previousSolo;
  previousSolo = solo;
  if (solo === null) {
    if (soloChanged) stopTour();
    tourShows = null;
  } else if (mapShows !== tourShows) {
    tourShows = mapShows;
    queueMicrotask(playTour);
  }
  const today = parseIsoDate(current.today).getTime();
  const bandsChanged = derived.visibleBands !== previousVisibleBands;
  const areaChanged = derived.area !== previousArea;
  if (bandsChanged || areaChanged) {
    previousVisibleBands = derived.visibleBands;
    previousArea = derived.area;
    if (firstRender && restoreWindow !== null) {
      timeline.fitToData(false, restoreRange(restoreWindow));
      restoreWindow = null;
    } else if (firstRender) {
      const preset = current.timePreset ?? defaultPreset(derived.bandShows, today);
      queueMicrotask(() => applyPreset(preset, false));
    } else if (areaChanged || !soloChanged) {
      queueMicrotask(refitAfterFilterChange);
    }
  }

  const nearby = select.nearbyShows(current, derived);
  mapControls.render({
    view: current.mapView,
    mode: current.mapMode,
    status: current.locationStatus ?? (nearby === null || areaWithin === null ? null : t().map.nearby(nearby.length, areaWithin)),
    canListNearby: nearby !== null && nearby.length > 0,
    canClearArea: derived.area !== null,
    picking: current.pickRadius !== null,
  });

  timelineControls.render({
    preset: state.get().timePreset,
    availablePresets: new Set(PRESET_IDS.filter((preset) => isPresetAvailable(preset, derived.bandShows, today, current.includePastMonth))),
    followTimeline: current.followTimeline,
    hideEmptyLanes: current.hideEmptyLanes,
    includePastMonth: current.includePastMonth,
    tourPacing: current.tourPacing,
  });
  settings.render({ style: current.style, theme: current.theme });

  const inRange = select.bandsInRange(current, derived);
  bandList.render({
    bands: inRange.ordered,
    showsInRange: inRange.shows,
    areaWithin,
    collapseBandsWithoutShows: current.hideEmptyLanes,
    totalBandCount: derived.bands.length,
    checkedGenreCount: current.tagFilter.size,
    hiddenBandIds: current.hiddenBandIds,
    filter: current.bandFilter,
    sort: current.bandSort,
    mode: theme.mode,
    previewCount: current.previewResults.length,
  });
  const selected = select.selection(current, derived);
  const panel = sidebarPanel(current);
  const previewsShown = current.previewsOpen && current.previewResults.length > 0;
  const heading = current.selection.kind === 'none' ? null : selectionHeading(current, derived, selected);
  const drillDownTitle = heading?.title ?? t().page.previewedFiles;
  if (sidebar.show(panel, panel === 'selection' ? selectionKey(current.selection) : panel) && panel !== 'lists') sheet.reveal(drillDownTitle, !firstRender);
  const listsLabel = t().selection.back[sidebar.activeTab()];
  if (heading !== null) {
    selectionPanel.render({
      heading,
      shows: selected,
      showBand: current.selection.kind !== 'bands' || current.selection.bandIds.size > 1,
      backLabel: previewsShown ? t().selection.back.previews : listsLabel,
      mode: theme.mode,
      aroundHere: aroundHereRow(current, derived),
    });
    selectionPanel.highlight(current.hoverShowIds);
  }
  placeList.render({ places: select.places(current, derived), selected: current.selection.kind === 'places' ? current.selection.places : NO_PLACES, areaWithin });
  genreList.render({ genres: select.genres(current, derived), checked: current.tagFilter });
  if (panel === 'lists') sheet.setLabel(t().sheet.summary(derived.visibleBands.length, derived.bands.length), t().page.sidebarToggle(derived.visibleBands.length, derived.bands.length));
  else sheet.setLabel(drillDownTitle, null);
  search.setIndex(select.searchIndex(derived));
  previewPanel.render(current.previewResults, listsLabel);
  scheduleUrlUpdate();
}

/** An unchanged window keeps its object, so nothing derived from it is worked out again. */
function setTimeWindow(window: TimeWindow) {
  if (!sameWindow(state.get().timeWindow, window)) state.set({ timeWindow: window });
}

/** The window the timeline will report once it has a width, so the first render already shows it. */
function startWindow(current: AppState): TimeWindow {
  const derived = derive(current);
  const today = parseIsoDate(current.today).getTime();
  const range =
    restoreWindow !== null
      ? restoreRange(restoreWindow)
      : presetWindow(current.timePreset ?? defaultPreset(derived.bandShows, today), derived.visibleShows, today, current.includePastMonth);
  const [start, end] = range ?? fitDomain(derived.visibleShows, today);
  return { start, end };
}

function restoreRange(window: { readonly from: string; readonly to: string }): readonly [number, number] {
  return [parseIsoDate(window.from).getTime(), parseIsoDate(window.to).getTime() + DAY_MS];
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
  const overlay = h(
    'div',
    { class: 'drop-overlay', hidden: true, 'aria-hidden': 'true' },
    h('div', {}, h('p', {}, t().page.dropFiles), h('p', { class: 'drop-overlay-note' }, t().page.dropFilesNote)),
  );
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

/**
 * The tour animation of a band view: the routes draw themselves leg by leg, with a playhead on the timeline.
 * It (re)starts whenever the band view's shows change (opening it, a new time range, loading the page) or the
 * pacing does, and stops when the viewer takes over the map.
 */
let tourPlaying: { readonly frame: number } | null = null;
let tourShows: readonly ShowRef[] | null = null;

function playTour() {
  stopTour();
  const current = state.get();
  const solo = soloBandIds(current.selection);
  if (solo === null || prefersReducedMotion()) return;
  const shows = select.mapShows(derive(current), select.windowFilter(current));
  const clock = createTourClock(shows.filter((ref) => solo.has(ref.band.file.band.id) && ref.show.status !== 'cancelled').map((ref) => ref.start), current.tourPacing);
  if (clock === null) return;
  map.setTour({ bandIds: solo, at: clock.at });
  const started = performance.now();
  const step = (now: number) => {
    const elapsed = now - started;
    if (elapsed >= clock.durationMs) {
      stopTour();
      return;
    }
    map.setTourTime(elapsed);
    timeline.setPlayhead(clock.dateAt(elapsed));
    tourPlaying = { frame: requestAnimationFrame(step) };
  };
  tourPlaying = { frame: requestAnimationFrame(step) };
}

function stopTour() {
  if (tourPlaying === null) return;
  cancelAnimationFrame(tourPlaying.frame);
  tourPlaying = null;
  map.setTour(null);
  timeline.setPlayhead(null);
}

function selectBands(bandIds: ReadonlySet<string>) {
  const { timeWindow } = state.get();
  sidebar.showTab('bands');
  const selection: Selection = { kind: 'bands', bandIds };
  state.set({ selection });
  fitMapTo(selectionShows(selection, timeWindow, derive(state.get())));
}

function selectGenre(genreId: string) {
  sidebar.showTab('genres');
  const selection: Selection = { kind: 'genres', genreIds: new Set([genreId]) };
  state.set({ selection });
  fitMapTo(selectionShows(selection, state.get().timeWindow, derive(state.get())));
}

function isGenreId(id: string): boolean {
  return id === NO_GENRE || TAG_VOCABULARY.byId.get(id)?.group === 'genre';
}

function genreLabel(id: string): string {
  if (id === NO_GENRE) return t().genreList.noGenre;
  const tag = TAG_VOCABULARY.byId.get(id);
  if (tag === undefined) throw new Error(`unknown genre ${id}`);
  return tag.label;
}

/** Frames a drill-down's shows; an active area stays, with its circle. */
function fitMapTo(shows: readonly ShowRef[]) {
  if (shows.length === 0) return;
  if (derive(state.get()).area === null) {
    state.set({ mapView: { kind: 'shows' } });
    map.setAreaCircle(null);
  }
  map.fitToShows(shows, true);
}

/** The map's corner button: inside an active area it frames the shows there (or the circle when there are none) and keeps the area. */
function fitToScope() {
  const current = state.get();
  const derived = derive(current);
  if (derived.area === null) {
    setMapView({ kind: 'shows' });
    return;
  }
  const shows = select.mapShows(derived, select.windowFilter(current));
  if (shows.length === 0) applyMapView(current.mapView, true);
  else map.fitToShows(shows, true);
}

/** The radius chips of a place's list, pressed while the area is centred on that place. */
function aroundHereRow(current: AppState, derived: Derived): { readonly activeRadius: Distance | null } | null {
  const place = select.selectionPlace(current, derived);
  if (place === null) return null;
  const { mapView } = current;
  const centredHere = mapView.kind === 'point' && mapView.center[0] === place[0] && mapView.center[1] === place[1];
  return { activeRadius: centredHere ? mapView.radius : null };
}

function startPicking(radius: Distance) {
  stopTour();
  state.set({ pickRadius: radius });
}

function setAroundPoint(center: LonLat, radius: Distance) {
  stopTour();
  setMapView(pointView(center, radius));
}

function focusSearchResult(entry: SearchEntry) {
  const derived = derive(state.get());
  if (entry.kind === 'band') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) selectBands(new Set([bandId]));
    return;
  }
  if (entry.kind === 'tag') {
    selectGenre(entry.ref);
    return;
  }
  const shows = entry.showIds.flatMap((id) => derived.showsById.get(id) ?? []);
  if (shows.length === 0) return;
  const placeKey = entry.kind === 'place' ? searchPlaceKey(entry.ref) : null;
  searchFocus = { shows, until: performance.now() + SEARCH_FOCUS_TIMEOUT_MS };
  const { hiddenBandIds } = state.get();
  if (entry.bandIds.some((bandId) => hiddenBandIds.has(bandId))) {
    state.set({ hiddenBandIds: new Set([...hiddenBandIds].filter((bandId) => !entry.bandIds.includes(bandId))) });
  }
  const area = derived.area;
  const keepsArea = area !== null && showsInArea(shows, area).length === shows.length;
  const selection: Selection = placeKey === null ? { kind: 'shows', showIds: new Set(entry.showIds) } : { kind: 'places', places: new Set([placeKey]) };
  state.set({ ...(keepsArea ? {} : { mapView: { kind: 'shows' } }), selection, timePreset: null });
  if (!keepsArea) map.setAreaCircle(null);
  map.fitToShows(shows, true);
  const start = Math.min(...shows.map((ref) => ref.start));
  const end = Math.max(...shows.map((ref) => ref.end)) + DAY_MS;
  const padding = Math.max(7 * DAY_MS, (end - start) * 0.1);
  timeline.zoomToRange(start - padding, end + padding, true);
}

/** A preset the viewer (or the start-up default) chose, for the shows in scope; an empty result stays chosen. */
function applyPreset(preset: TimePreset, animate: boolean) {
  const current = state.get();
  state.set({ timePreset: preset });
  timeline.fitToData(animate, presetWindow(preset, derive(current).visibleShows, parseIsoDate(current.today).getTime(), current.includePastMonth));
}

/** Bands, genres or the area changed: the timeline refits to the shows now in scope and keeps the chosen preset or range. */
function refitAfterFilterChange() {
  const current = state.get();
  // Until the timeline reports its first window there is no range of the viewer's own to keep; its pending fit reads the new shows itself.
  if (current.timePreset === null && current.timeWindow === null) return;
  const today = parseIsoDate(current.today).getTime();
  timeline.fitToData(true, windowAfterFilterChange(current.timePreset, current.timeWindow, derive(current).visibleShows, today, current.includePastMonth));
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
    case 'nearby':
      return 'nearby';
    case 'places':
      return `places:${[...selection.places].toSorted().join(',')}`;
    case 'bands':
      return `bands:${[...selection.bandIds].toSorted().join(',')}`;
    case 'genres':
      return `genres:${[...selection.genreIds].toSorted().join(',')}`;
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
  const text = t().selection;
  const dates = window === null ? text.allDates : text.between(formatDate(formatIsoDate(new Date(window.start))), formatDate(formatIsoDate(new Date(window.end))));
  const areaWithin = select.areaWithin(current, derived);
  const range = areaWithin === null ? dates : text.near(dates, areaWithin);
  const live = text.live(shows.length, range);
  const { selection } = current;
  switch (selection.kind) {
    case 'none':
      throw new Error('no selection to describe');
    case 'bands': {
      const names = derived.bands.filter((entry) => selection.bandIds.has(entry.file.band.id)).map((entry) => entry.file.band.name);
      if (names.length !== selection.bandIds.size) throw new Error(`unknown band in ${[...selection.bandIds].join(', ')}`);
      const [onlyBandId] = selection.bandIds;
      const title = names.length <= MAX_NAMED_BANDS ? formatList(names) : t().bands(names.length);
      return {
        title,
        bandId: names.length === 1 && onlyBandId !== undefined ? onlyBandId : null,
        canReplayTour: !prefersReducedMotion(),
        note: live,
        emptyMessage: names.length === 1 ? text.emptyNamed(title, range) : text.emptyBands(range),
      };
    }
    case 'genres': {
      const title = formatList([...selection.genreIds].map(genreLabel));
      return { title, bandId: null, canReplayTour: false, note: live, emptyMessage: text.emptyNamed(title, range) };
    }
    case 'nearby': {
      if (areaWithin === null) throw new Error('the nearby shows need an area');
      return { title: text.nearbyTitle(areaWithin), bandId: null, canReplayTour: false, note: live, emptyMessage: text.emptyNearby(range) };
    }
    case 'places': {
      const name = describePlaces(selection.places, derived.bandShows, countryName, t().placeList.andMore);
      return { title: name, bandId: null, canReplayTour: false, note: live, emptyMessage: text.emptyPlace(name, range) };
    }
    case 'shows':
      return { title: pickedShowsTitle(shows), bandId: null, canReplayTour: false, note: null, emptyMessage: text.hiddenPicked };
  }
}

function pickedShowsTitle(shows: readonly ShowRef[]): string {
  const cities = new Set(shows.map((ref) => ref.show.city));
  const bands = new Set(shows.map((ref) => ref.band.file.band.name));
  const [onlyCity] = cities;
  const [onlyBand] = bands;
  const text = t().selection;
  if (shows.length === 1 && onlyBand !== undefined && onlyCity !== undefined) return text.pickedOne(onlyBand, onlyCity);
  const band = bands.size === 1 && onlyBand !== undefined ? onlyBand : null;
  return cities.size === 1 && onlyCity !== undefined ? text.pickedInCity(shows.length, onlyCity, band) : text.pickedInCities(shows.length, cities.size, band);
}

/** Puts the app into the view a URL describes: the home link uses the empty URL, history the one it returns to. */
function applyUrlView(url: UrlState) {
  searchFocus = null;
  const mapView = mapViewFromUrl(url);
  const mapMode = url.globe ? 'globe' : 'flat';
  const hiddenBandIds = new Set(url.hiddenBandIds.filter((id) => knownBandIds.has(id)));
  const tagFilter = new Set(url.tags.filter(isGenreId));
  const range = url.from !== null && url.to !== null ? ([parseIsoDate(url.from).getTime(), parseIsoDate(url.to).getTime() + DAY_MS] as const) : null;
  const selection = selectionFromUrl(url, knownBandIds, isGenreId);
  const current = state.get();
  const shows = derive({ ...current, hiddenBandIds, tagFilter, selection, mapView }).bandShows;
  const preset = range === null ? (url.preset ?? defaultPreset(shows, parseIsoDate(current.today).getTime())) : null;
  state.set({
    hiddenBandIds,
    tagFilter,
    bandSort: url.sort ?? 'name',
    bandFilter: '',
    selection,
    followTimeline: url.follow ?? true,
    hideEmptyLanes: !url.allLanes,
    includePastMonth: url.includePastMonth,
    tourPacing: url.tourPacing,
    timePreset: preset,
    mapView,
    mapMode,
    hoverShowIds: new Set(),
    focusBandId: null,
    locationStatus: null,
    pickRadius: null,
  });
  map.setMode(mapMode);
  applyMapView(mapView, true);
  // After the refit that a change of visible bands queues, so the URL's range wins.
  queueMicrotask(() => {
    if (preset !== null) applyPreset(preset, true);
    else timeline.fitToData(true, range);
  });
}

/** The area menu: one choice of fit, Near me, a picked point or region. Leaving the area closes the list of its shows. */
function setMapView(view: MapViewPreset) {
  const current = state.get();
  const previous = current.mapView;
  const closesNearby = current.selection.kind === 'nearby' && activeArea({ mapView: view, userPosition: current.userPosition }) === null;
  state.set({ mapView: view, locationStatus: null, pickRadius: null, ...(closesNearby ? { selection: NO_SELECTION } : {}) });
  if (view.kind !== 'near') {
    applyMapView(view, true);
    return;
  }
  if (!('geolocation' in navigator)) {
    state.set({ mapView: previous, locationStatus: t().map.locationUnsupported });
    return;
  }
  const known = state.get().userPosition;
  if (known !== null) {
    applyMapView(view, true);
    return;
  }
  state.set({ locationStatus: t().map.locating });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.set({ userPosition: [position.coords.longitude, position.coords.latitude], locationStatus: null });
      applyMapView(state.get().mapView, true);
    },
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? t().map.locationDenied
          : t().map.locationFailed;
      state.set({ mapView: previous, locationStatus: message });
      applyMapView(previous, true);
    },
    { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
  );
}

function applyMapView(view: MapViewPreset, animate: boolean) {
  const circle = areaCircle(view, state.get().userPosition);
  map.setAreaCircle(circle);
  if (circle !== null) {
    map.fitToPoints([[circle.lon, circle.lat]], circle.radiusKm * 2, animate);
    return;
  }
  if (view.kind === 'region') map.fitToPoints(regionPoints(view.region), 300, animate);
  else map.fitToData(animate);
}

function areaCircle(view: MapViewPreset, userPosition: AppState['userPosition']): AreaCircle | null {
  if (view.kind === 'point') return { lon: view.center[0], lat: view.center[1], radiusKm: kilometres(view.radius), centre: 'point' };
  if (view.kind === 'near' && userPosition !== null) return { lon: userPosition[0], lat: userPosition[1], radiusKm: kilometres(view.radius), centre: 'viewer' };
  return null;
}

function resetViews() {
  searchFocus = null;
  state.set({ selection: NO_SELECTION, hoverShowIds: new Set(), focusBandId: null, mapView: { kind: 'shows' }, pickRadius: null, locationStatus: null });
  map.setAreaCircle(null);
  map.fitToData(true);
  const current = state.get();
  applyPreset(defaultPreset(derive(current).bandShows, parseIsoDate(current.today).getTime()), true);
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
    selectedGenres: current.selection.kind === 'genres' ? [...current.selection.genreIds] : [],
    follow: current.followTimeline ? null : false,
    preset: current.timePreset === null || current.timePreset === defaultPreset(derive(current).bandShows, parseIsoDate(current.today).getTime()) ? null : current.timePreset,
    allLanes: !current.hideEmptyLanes,
    includePastMonth: current.includePastMonth,
    tourPacing: current.tourPacing,
    region: current.mapView.kind === 'region' ? current.mapView.region.id : null,
    around: aroundOf(current.mapView),
    globe: current.mapMode === 'globe',
    style: current.style,
    ...localeChoice(),
  });
}

/** The language, clock and distance unit apply at start-up, so changing them reloads the page with the choice in the URL. */
function reloadWithLocale(choice: LocaleChoice) {
  if (state.get().previewResults.length > 0 && !window.confirm(t().settings.reloadLosesPreviews)) return;
  const hash = serializeUrlState({ ...parseUrlState(currentHash()), ...choice });
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  location.reload();
}

/**
 * Browser history for the sidebar and the home link. Opening a drill-down adds one entry, so Back (and the
 * mouse's back button) returns to the lists. The home link adds an entry for the default view, so Back
 * restores the whole view from before it.
 */
function createNavigation() {
  let quiet = false;
  let previousPanel = sidebarPanel(state.get());
  let onHomeEntry = isHomeEntry(history.state);
  const writeEntry = (method: 'pushState' | 'replaceState', entry: unknown, hash: string) => {
    try {
      history[method](entry, '', `${location.pathname}${location.search}${hash}`);
    } catch {
      return;
    }
  };
  const quietly = (change: () => void) => {
    quiet = true;
    try {
      change();
    } finally {
      quiet = false;
      previousPanel = sidebarPanel(state.get());
    }
  };

  if (previousPanel !== 'lists') {
    const sharedHash = location.hash;
    writeEntry('replaceState', null, serializeUrlState({ ...urlState, selectedShowIds: [], selectedPlaces: [], selectedBandIds: [], selectedGenres: [] }));
    writeEntry('pushState', drillDownEntry(previousPanel), sharedHash);
  }

  state.subscribe((current) => {
    if (quiet) return;
    const panel = sidebarPanel(current);
    const step = historyStep(previousPanel, panel, asDrillDownEntry(history.state) !== null);
    previousPanel = panel;
    if (step === 'push') {
      writeEntry('pushState', drillDownEntry(panel), currentHash());
      onHomeEntry = false;
    } else if (step === 'replace') {
      writeEntry('replaceState', drillDownEntry(panel), currentHash());
    } else if (step === 'back') {
      history.back();
    }
  });

  window.addEventListener('popstate', () => {
    const wholeView = onHomeEntry || isHomeEntry(history.state);
    onHomeEntry = isHomeEntry(history.state);
    const url = parseUrlState(location.hash);
    quietly(() => {
      if (wholeView) applyUrlView(url);
      else state.set({ selection: selectionFromUrl(url, knownBandIds, isGenreId) });
      state.set({ previewsOpen: asDrillDownEntry(history.state)?.previews === true });
    });
  });

  return {
    /** Resets to the default view in a new history entry. */
    goHome() {
      clearTimeout(urlTimer);
      writeUrlState();
      const leaving = location.hash;
      const home = serializeUrlState({ ...parseUrlState(''), style: state.get().style, ...localeChoice() });
      search.clear();
      placeList.clearFilter();
      sidebar.showTab('bands');
      quietly(() => {
        state.set({ previewsOpen: false });
        applyUrlView(parseUrlState(home));
      });
      if (leaving === home) return;
      writeEntry('pushState', HOME_ENTRY, home);
      onHomeEntry = true;
    },
  };
}

function refreshTheme() {
  theme = readThemeTokens(state.get().theme);
  applyThemeColor(theme.panel);
  renderAll();
}

state.set({ timeWindow: startWindow(state.get()) });
state.subscribe(renderAll);
const navigation = createNavigation();
requireElement(document, '#home-link', HTMLAnchorElement).addEventListener('click', (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigation.goHome();
});
renderAll();
startup.finishAfterFirstFrame();
