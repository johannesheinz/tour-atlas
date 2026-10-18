import { DATE_PATTERN } from './data/ids.ts';
import { isCalendarDate } from './data/dates.ts';
import type { BandSort } from './model.ts';
import { PRESET_IDS, type TimePreset } from './view/timePresets.ts';
import type { TourPacing } from './view/tourClock.ts';
import { PLACE_KEY_PATTERN } from './places.ts';
import { isClock, isLanguage, type Clock, type Language } from './i18n/locale.ts';
import { DEFAULT_STYLE, isStyle, type Style } from './data/styles.ts';

/** View state kept in the URL hash: shareable, never stored, never sent to a server. */
export interface UrlState {
  readonly hiddenBandIds: readonly string[];
  readonly tags: readonly string[];
  readonly sort: BandSort | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly selectedShowIds: readonly string[];
  readonly selectedPlaces: readonly string[];
  readonly selectedBandIds: readonly string[];
  readonly selectedGenres: readonly string[];
  readonly follow: boolean | null;
  readonly preset: TimePreset | null;
  readonly allLanes: boolean;
  readonly includePastMonth: boolean;
  readonly tourPacing: TourPacing;
  /** Region id of the map view; "Near me" is never put in the URL. */
  readonly region: string | null;
  readonly globe: boolean;
  readonly style: Style;
  /** Set only when picked in the settings; otherwise the browser decides. */
  readonly language: Language | null;
  readonly clock: Clock | null;
}

const SORTS: readonly BandSort[] = ['name', 'next-show', 'show-count'];
const ID_PATTERN = /^[a-z0-9-]+$/;

export function parseUrlState(hash: string): UrlState {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const list = (name: string) => (params.get(name) ?? '').split(',').filter((id) => ID_PATTERN.test(id));
  const date = (name: string) => {
    const value = params.get(name);
    return value !== null && DATE_PATTERN.test(value) && isCalendarDate(value) ? value : null;
  };
  const sortParam = params.get('sort');
  const followParam = params.get('follow');
  const from = date('from');
  const to = date('to');
  const validRange = from !== null && to !== null && from <= to;
  return {
    hiddenBandIds: list('hide'),
    tags: list('tags'),
    sort: SORTS.find((sort) => sort === sortParam) ?? null,
    from: validRange ? from : null,
    to: validRange ? to : null,
    selectedShowIds: list('show'),
    selectedPlaces: (params.get('at') ?? '').split(',').filter((key) => PLACE_KEY_PATTERN.test(key)),
    selectedBandIds: list('band'),
    selectedGenres: list('genre'),
    follow: followParam === '0' ? false : followParam === '1' ? true : null,
    preset: PRESET_IDS.find((preset) => preset === params.get('when')) ?? null,
    allLanes: params.get('lanes') === 'all',
    includePastMonth: params.get('recent') === '1',
    tourPacing: params.get('pace') === 'even' ? 'even' : 'calendar',
    region: ID_PATTERN.test(params.get('view') ?? '') ? params.get('view') : null,
    globe: params.get('globe') === '1',
    style: oneOf(params.get('style'), isStyle) ?? DEFAULT_STYLE,
    language: oneOf(params.get('lang'), isLanguage),
    clock: oneOf(params.get('clock'), isClock),
  };
}

export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.hiddenBandIds.length > 0) params.set('hide', state.hiddenBandIds.toSorted().join(','));
  if (state.tags.length > 0) params.set('tags', state.tags.toSorted().join(','));
  if (state.sort !== null) params.set('sort', state.sort);
  if (state.from !== null && state.to !== null) {
    params.set('from', state.from);
    params.set('to', state.to);
  }
  if (state.selectedShowIds.length > 0) params.set('show', state.selectedShowIds.toSorted().join(','));
  if (state.selectedPlaces.length > 0) params.set('at', state.selectedPlaces.toSorted().join(','));
  if (state.selectedBandIds.length > 0) params.set('band', state.selectedBandIds.toSorted().join(','));
  if (state.selectedGenres.length > 0) params.set('genre', state.selectedGenres.toSorted().join(','));
  if (state.follow !== null) params.set('follow', state.follow ? '1' : '0');
  if (state.preset !== null) params.set('when', state.preset);
  if (state.allLanes) params.set('lanes', 'all');
  if (state.includePastMonth) params.set('recent', '1');
  if (state.tourPacing === 'even') params.set('pace', 'even');
  if (state.region !== null) params.set('view', state.region);
  if (state.globe) params.set('globe', '1');
  if (state.style !== DEFAULT_STYLE) params.set('style', state.style);
  if (state.language !== null) params.set('lang', state.language);
  if (state.clock !== null) params.set('clock', state.clock);
  const text = params.toString().replaceAll('%2C', ',');
  return text === '' ? '' : `#${text}`;
}

function oneOf<T extends string>(value: string | null, is: (candidate: string) => candidate is T): T | null {
  return value !== null && is(value) ? value : null;
}
