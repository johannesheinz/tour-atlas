import { DATE_PATTERN } from './data/ids.ts';
import { isCalendarDate } from './data/dates.ts';
import type { BandSort } from './model.ts';
import { PRESET_IDS, type TimePreset } from './view/timePresets.ts';
import type { TourPacing } from './view/tourClock.ts';
import { PLACE_KEY_PATTERN } from './places.ts';
import { isClock, isDistanceUnit, isLanguage, type Clock, type DistanceUnit, type Language } from './i18n/locale.ts';
import { DEFAULT_STYLE, isStyle, type Style } from './data/styles.ts';
import type { Area } from './appState.ts';
import { NEAR_ME_RADII, findRegion, type MapViewPreset } from './view/mapRegions.ts';
import { pointView, roundCoordinate } from './view/aroundPoint.ts';

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
  /** A picked point with its radius; the centre rounded to two decimals. */
  readonly around: Area | null;
  readonly globe: boolean;
  readonly style: Style;
  /** Set only when picked in the settings; otherwise the browser decides. */
  readonly language: Language | null;
  readonly clock: Clock | null;
  readonly distance: DistanceUnit | null;
}

const SORTS: readonly BandSort[] = ['name', 'next-show', 'show-count'];
const ID_PATTERN = /^[a-z0-9-]+$/;
const COORDINATES_PATTERN = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;
const RADIUS_PATTERN = /^(\d+(?:\.\d+)?)(km|mi|mil)$/;

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
    around: parseAround(params.get('around'), params.get('radius')),
    globe: params.get('globe') === '1',
    style: oneOf(params.get('style'), isStyle) ?? DEFAULT_STYLE,
    language: oneOf(params.get('lang'), isLanguage),
    clock: oneOf(params.get('clock'), isClock),
    distance: oneOf(params.get('units'), isDistanceUnit),
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
  if (state.around !== null) {
    const [lon, lat] = state.around.center;
    params.set('around', `${roundCoordinate(lat)},${roundCoordinate(lon)}`);
    params.set('radius', `${state.around.radius.value}${state.around.radius.unit}`);
  }
  if (state.globe) params.set('globe', '1');
  if (state.style !== DEFAULT_STYLE) params.set('style', state.style);
  if (state.language !== null) params.set('lang', state.language);
  if (state.clock !== null) params.set('clock', state.clock);
  if (state.distance !== null) params.set('units', state.distance);
  const text = params.toString().replaceAll('%2C', ',');
  return text === '' ? '' : `#${text}`;
}

/** "around=<lat>,<lon>&radius=50km": both or neither; only the radii the area menu offers in that unit. */
function parseAround(coordinates: string | null, radius: string | null): Area | null {
  const point = COORDINATES_PATTERN.exec(coordinates ?? '');
  const distance = RADIUS_PATTERN.exec(radius ?? '');
  if (point === null || distance === null) return null;
  const lat = Number(point[1]);
  const lon = Number(point[2]);
  const value = Number(distance[1]);
  const unit = oneOf(distance[2] ?? null, isDistanceUnit);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || unit === null || !NEAR_ME_RADII[unit].includes(value)) return null;
  return { center: [roundCoordinate(lon), roundCoordinate(lat)], radius: { value, unit } };
}

/** The picked point goes into the URL; "Near me" never does. */
export function aroundOf(view: MapViewPreset): Area | null {
  return view.kind === 'point' ? { center: view.center, radius: view.radius } : null;
}

/** A picked point wins over a region; an unknown region fits the shows. */
export function mapViewFromUrl(url: Pick<UrlState, 'region' | 'around'>): MapViewPreset {
  if (url.around !== null) return pointView(url.around.center, url.around.radius);
  const region = url.region === null ? undefined : findRegion(url.region);
  return region === undefined ? { kind: 'shows' } : { kind: 'region', region };
}

function oneOf<T extends string>(value: string | null, is: (candidate: string) => candidate is T): T | null {
  return value !== null && is(value) ? value : null;
}
