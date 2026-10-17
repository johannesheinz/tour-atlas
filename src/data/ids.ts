import type { DraftShow, IdentifiedShow } from './types';

const LETTERS_WITHOUT_DECOMPOSITION: Readonly<Record<string, string>> = {
  ß: 'ss', ẞ: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ð: 'd', Ð: 'd',
  ł: 'l', Ł: 'l', þ: 'th', Þ: 'th', ı: 'i', ħ: 'h', Ħ: 'h', ŧ: 't', Ŧ: 't',
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHOW_ID_SUFFIX_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase, ASCII-folded, hyphenated. "São Paulo" → "sao-paulo", "Łódź" → "lodz". */
export function slugify(text: string): string {
  const substituted = Array.from(text, (char) => LETTERS_WITHOUT_DECOMPOSITION[char] ?? char).join('');
  return substituted
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class IdError extends Error {}

export function baseShowId(bandId: string, date: string, city: string): string {
  const citySlug = slugify(city);
  if (citySlug === '') {
    throw new IdError(`city "${city}" has no Latin letters or digits to build an id from; use the Latin-script name`);
  }
  return `${bandId}-${date}-${citySlug}`;
}

export function isShowIdFormat(id: string, bandId: string): boolean {
  const prefix = `${bandId}-`;
  return id.startsWith(prefix) && SHOW_ID_SUFFIX_PATTERN.test(id.slice(prefix.length));
}

/**
 * Keeps existing ids and generates `${bandId}-${date}-${citySlug}` for missing ones.
 * A second show in the same city on the same day gets "-2", a third "-3", and so on.
 */
export function assignShowIds(bandId: string, shows: readonly DraftShow[]): IdentifiedShow[] {
  const taken = new Set(shows.flatMap((show) => (show.id === null ? [] : [show.id])));
  const assigned = new Map<DraftShow, string>();
  const missing = shows
    .filter((show) => show.id === null)
    .toSorted((a, b) => compareForIdAssignment(a, b));

  for (const show of missing) {
    const base = baseShowId(bandId, show.date, show.city);
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) {
      candidate = `${base}-${n}`;
    }
    taken.add(candidate);
    assigned.set(show, candidate);
  }

  return shows.map((show) => {
    const id = show.id ?? assigned.get(show);
    if (id === undefined) {
      throw new IdError(`no id assigned for show on ${show.date} in ${show.city}`);
    }
    return { ...show, id };
  });
}

function compareForIdAssignment(a: DraftShow, b: DraftShow): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    (a.venue ?? '').localeCompare(b.venue ?? '') ||
    a.city.localeCompare(b.city)
  );
}
