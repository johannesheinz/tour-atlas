import './styles.css';
import world from 'virtual:world-topology';
import { createDeriver, type AppState } from './appState.ts';
import { addDays, formatIsoDate, localToday, parseIsoDate } from './data/dates.ts';
import type { ShowRef } from './model.ts';
import { createSelectors } from './selectors.ts';
import { createStore } from './state.ts';
import { createBundledStore } from './store/bundled.ts';
import { parseUrlState, serializeUrlState } from './urlState.ts';
import { createCountryLocator, type CountryLocator } from './data/countryLocator.ts';
import { isKnownTag } from './data/tags.ts';
import { exportAll, mergePreviews, normalizedFileText, processPreviewFile, type PreviewResult } from './preview.ts';
import { createBandList } from './view/bandList.ts';
import { createPreviewPanel } from './view/previewPanel.ts';
import { createDetail } from './view/detail.ts';
import { h, requireElement } from './view/dom.ts';
import { MAP_SETTINGS, createMapView } from './view/map.ts';
import { createSearch } from './view/search.ts';
import type { SearchEntry } from './view/searchIndex.ts';
import { applyThemePreference, readThemeColors, watchSystemTheme, type ThemeColors, type ThemePreference } from './view/theme.ts';
import { DAY_MS } from './view/timeScale.ts';
import { createTimeline } from './view/timeline.ts';
import { createTimelineControls } from './view/timelineControls.ts';
import { PRESET_IDS, defaultPreset, isPresetAvailable, presetRange, type TimePreset } from './view/timePresets.ts';

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
  hiddenBandIds: new Set(urlState.hiddenBandIds.filter((id) => knownBandIds.has(id))),
  tagFilter: new Set(urlState.tags.filter(isKnownTag)),
  bandSort: urlState.sort ?? 'name',
  bandFilter: '',
  focusBandId: null,
  hoverShowIds: new Set(),
  selectedShowIds: new Set(urlState.selectedShowIds),
  timeWindow: null,
  followTimeline: urlState.follow ?? true,
  timePreset: urlState.preset,
  hideEmptyLanes: !urlState.allLanes,
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
  onWindowChange(window, byUser) {
    if (byUser) state.set({ timePreset: null });
    clearTimeout(windowTimer);
    windowTimer = setTimeout(() => state.set({ timeWindow: window }), WINDOW_DEBOUNCE_MS);
  },
  onShowAllLanes: () => state.set({ hideEmptyLanes: false }),
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
  onToggleTag(tagId) {
    const tags = new Set(state.get().tagFilter);
    if (tags.has(tagId)) tags.delete(tagId);
    else tags.add(tagId);
    state.set({ tagFilter: tags });
  },
  onClearTags: () => state.set({ tagFilter: new Set() }),
});

const detail = createDetail(requireElement(document, '#detail', HTMLElement), {
  onClear: () => state.set({ selectedShowIds: new Set() }),
});

const previewPanel = createPreviewPanel(requireElement(document, '#preview-panel', HTMLElement), {
  onDownload: (preview) => {
    const bandId = preview.normalized?.band.id;
    if (bandId === undefined) throw new Error(`${preview.fileName} has nothing to download`);
    downloadText(`${bandId}.json`, normalizedFileText(preview));
  },
  onRemove: (preview) => setPreviews(state.get().previewResults.filter((item) => item !== preview)),
  onClearAll: () => setPreviews([]),
});

const search = createSearch(requireElement(document, '#search', HTMLDivElement), { onChoose: focusSearchResult });

const timelineControls = createTimelineControls(requireElement(document, '#timeline-controls', HTMLDivElement), {
  onPreset: (preset) => applyPreset(preset, true),
  onHideEmptyLanes: (hide) => state.set({ hideEmptyLanes: hide }),
  onFollowTimeline: (follow) => state.set({ followTimeline: follow }),
});
const toolbarHint = requireElement(document, '#toolbar-hint', HTMLParagraphElement);

requireElement(document, '#zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1.6));
requireElement(document, '#zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomBy(1 / 1.6));
requireElement(document, '#fit-map', HTMLButtonElement).addEventListener('click', () => map.fitToData(true));

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
    selectedShowIds: current.selectedShowIds,
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
  timelineControls.render({
    preset: state.get().timePreset,
    availablePresets: new Set(PRESET_IDS.filter((preset) => isPresetAvailable(preset, derived.visibleShows, today))),
    hideEmptyLanes: current.hideEmptyLanes,
    followTimeline: current.followTimeline,
  });
  toolbarHint.textContent = timeline.lanesOverflow()
    ? 'Scroll to zoom the timeline, drag to pan, Shift + scroll for more bands'
    : 'Scroll to zoom the timeline, drag to pan';

  bandList.render({
    bands: derived.filteredBands,
    totalBandCount: derived.bands.length,
    tagFilter: current.tagFilter,
    tagCounts: select.tagCounts(derived),
    hiddenBandIds: current.hiddenBandIds,
    filter: current.bandFilter,
    sort: current.bandSort,
    mode: theme.mode,
  });
  detail.render({ shows: select.selection(current, derived), mode: theme.mode });
  search.setIndex(select.searchIndex(derived));
  previewPanel.render(current.previewResults);
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
  requireElement(document, '#preview-panel', HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  state.set({ previewResults, previews: previewResults.flatMap((preview) => (preview.displayable === null ? [] : [preview.displayable])) });
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

function focusSearchResult(entry: SearchEntry) {
  const derived = derive(state.get());
  if (entry.kind === 'band') {
    const [bandId] = entry.bandIds;
    if (bandId !== undefined) soloBand(bandId);
    return;
  }
  if (entry.kind === 'tag') {
    state.set({ tagFilter: new Set([entry.ref]), hiddenBandIds: new Set() });
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
  state.set({ selectedShowIds: new Set(entry.showIds), timePreset: null });
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
  if (preset === null || !isPresetAvailable(preset, shows, today)) {
    if (preset !== null) state.set({ timePreset: 'all' });
    timeline.fitToData(animate, null);
    return;
  }
  state.set({ timePreset: preset });
  timeline.fitToData(animate, presetRange(preset, shows, today));
}

function resetViews() {
  searchFocus = null;
  const current = state.get();
  state.set({ selectedShowIds: new Set(), hoverShowIds: new Set(), focusBandId: null });
  map.fitToData(true);
  applyPreset(defaultPreset(derive(current).visibleShows, parseIsoDate(current.today).getTime()), true);
}

let urlTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleUrlUpdate() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrlState, URL_DEBOUNCE_MS);
}

function writeUrlState() {
  const current = state.get();
  const window = current.timeWindow;
  const showWindow = window !== null && current.timePreset === null && !timeline.isAtFit();
  const hash = serializeUrlState({
    hiddenBandIds: [...current.hiddenBandIds],
    tags: [...current.tagFilter],
    sort: current.bandSort === 'name' ? null : current.bandSort,
    from: showWindow ? formatIsoDate(new Date(window.start)) : null,
    to: showWindow ? addDays(formatIsoDate(new Date(window.end)), -1) : null,
    selectedShowIds: [...current.selectedShowIds],
    follow: current.followTimeline ? null : false,
    preset: current.timePreset === null || current.timePreset === defaultPreset(derive(current).visibleShows, parseIsoDate(current.today).getTime()) ? null : current.timePreset,
    allLanes: !current.hideEmptyLanes,
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
