import { DATE_PATTERN } from './data/ids.ts';
import { isCalendarDate } from './data/dates.ts';
import type { BandSort } from './model.ts';

/** View state kept in the URL hash: shareable, never stored, never sent to a server. */
export interface UrlState {
  readonly hiddenBandIds: readonly string[];
  readonly sort: BandSort | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly selectedShowIds: readonly string[];
  readonly follow: boolean | null;
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
    sort: SORTS.find((sort) => sort === sortParam) ?? null,
    from: validRange ? from : null,
    to: validRange ? to : null,
    selectedShowIds: list('show'),
    follow: followParam === '0' ? false : followParam === '1' ? true : null,
  };
}

export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.hiddenBandIds.length > 0) params.set('hide', state.hiddenBandIds.toSorted().join(','));
  if (state.sort !== null) params.set('sort', state.sort);
  if (state.from !== null && state.to !== null) {
    params.set('from', state.from);
    params.set('to', state.to);
  }
  if (state.selectedShowIds.length > 0) params.set('show', state.selectedShowIds.toSorted().join(','));
  if (state.follow !== null) params.set('follow', state.follow ? '1' : '0');
  const text = params.toString().replaceAll('%2C', ',');
  return text === '' ? '' : `#${text}`;
}
