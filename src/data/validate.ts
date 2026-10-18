import { isCountryCode } from './countries.ts';
import { daysBetween, isCalendarDate } from './dates.ts';
import { DATE_PATTERN, IdError, SLUG_PATTERN, baseShowId, isShowIdFormat } from './ids.ts';
import { ENGLISH_ISSUES, describeValue, issueText, type IssueCode, type IssueDetail, type IssueParams } from './issues.ts';
import { isKnownTag } from './tags.ts';
import {
  BAND_FILE_KEYS,
  BAND_KEYS,
  GEO_KEYS,
  GEO_PRECISIONS,
  GEO_SOURCES,
  LIMITS,
  SCHEMA_VERSION,
  SHOW_KEYS,
  SHOW_STATUSES,
  SOURCE_KEYS,
  type Band,
  type BandFile,
  type DraftBandFile,
  type DraftShow,
  type Geo,
  type Show,
  type Source,
} from './types.ts';

export type ValidationMode = 'draft' | 'repository';

export type ValidationIssue = {
  readonly file: string;
  /** Location inside the file, e.g. "shows[12].date"; empty for the file as a whole. */
  readonly path: string;
  /** In English, for the command-line tools; the app renders `code` and `params` in the viewer's language. */
  readonly message: string;
} & IssueDetail;

export function issue<K extends IssueCode>(code: K, params: IssueParams[K]): IssueDetail {
  // A generic code cannot be matched to its member of the IssueDetail union.
  return { code, params } as IssueDetail;
}

export function makeIssue(file: string, path: string, detail: IssueDetail): ValidationIssue {
  return { file, path, ...detail, message: issueText(ENGLISH_ISSUES, detail) };
}

/** The row each kept show has in the file, in the order validation kept them. */
export function acceptedRowIndexes(result: Pick<ValidationResult<unknown>, 'totalShows' | 'rejectedShowIndexes'>): number[] {
  const rejected = new Set(result.rejectedShowIndexes);
  return Array.from({ length: result.totalShows }, (_, index) => index).filter((index) => !rejected.has(index));
}

export interface ValidationResult<T> {
  readonly file: string;
  /** The file with only its valid shows, or null when the file-level fields are unusable. */
  readonly value: T | null;
  readonly issues: readonly ValidationIssue[];
  readonly totalShows: number;
  readonly rejectedShowIndexes: readonly number[];
}

export type ParseResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ValidationIssue };

export function parseBandJson(text: string, file: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, issue: makeIssue(file, '', issue('invalidJson', { reason })) };
  }
}

/** For upstream output: show ids and geo may be null. */
export function validateDraft(input: unknown, file: string): ValidationResult<DraftBandFile> {
  return validateBandFile(input, file, 'draft');
}

/** For data/bands/: every show needs an id and coordinates. */
export function validateRepository(input: unknown, file: string): ValidationResult<BandFile> {
  const result = validateBandFile(input, file, 'repository');
  if (result.value === null) return { ...result, value: null };
  const shows = result.value.shows.map((show) => {
    if (!isCompleteShow(show)) {
      throw new Error(`validator invariant broken: incomplete show accepted in ${file}`);
    }
    return show;
  });
  return { ...result, value: { ...result.value, shows } };
}

export function isCompleteShow(show: DraftShow): show is Show {
  return show.id !== null && show.geo !== null;
}

export function validateFileName(file: string, bandId: string): ValidationIssue | null {
  const baseName = file.split(/[\\/]/).at(-1);
  const expected = `${bandId}.json`;
  return baseName === expected ? null : makeIssue(file, '', issue('wrongFileName', { expected }));
}

export function validateCollection(entries: readonly { readonly file: string; readonly bandId: string }[]): ValidationIssue[] {
  const firstFileById = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const { file, bandId } of entries) {
    const firstFile = firstFileById.get(bandId);
    if (firstFile === undefined) {
      firstFileById.set(bandId, file);
    } else {
      issues.push(makeIssue(file, 'band.id', issue('duplicateBandId', { bandId, firstFile })));
    }
  }
  return issues;
}

export function formatIssue(issue: ValidationIssue): string {
  return issue.path === '' ? `${issue.file}: ${issue.message}` : `${issue.file} ${issue.path}: ${issue.message}`;
}

const INVALID: unique symbol = Symbol('invalid');
/** Issues that say a text does not have the expected shape. */
type PatternCode = 'notDate' | 'badBandId' | 'badColor' | 'badShowIdCharacters' | 'badTime' | 'badCountryFormat';
type Checked<T> = T | typeof INVALID;
type Check<T> = (path: string, value: unknown) => Checked<T>;
type JsonRecord = Readonly<Record<string, unknown>>;

const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

class Collector {
  readonly issues: ValidationIssue[] = [];

  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  add(path: string, detail: IssueDetail): typeof INVALID {
    this.issues.push(makeIssue(this.#file, path, detail));
    return INVALID;
  }

  record(path: string, value: unknown, allowedKeys: readonly string[]): Checked<JsonRecord> {
    if (!isRecord(value)) return this.add(path, issue('notObject', { got: describeValue(value) }));
    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) this.add(join(path, key), issue('unknownField', {}));
    }
    return value;
  }

  required<T>(record: JsonRecord, path: string, key: string, check: Check<T>): Checked<T> {
    const fieldPath = join(path, key);
    if (!Object.hasOwn(record, key)) return this.add(fieldPath, issue('missing', {}));
    return check(fieldPath, record[key]);
  }

  nullable<T>(record: JsonRecord, path: string, key: string, check: Check<T>): Checked<T | null> {
    const fieldPath = join(path, key);
    if (!Object.hasOwn(record, key)) return this.add(fieldPath, issue('missingUseNull', {}));
    const value = record[key];
    return value === null ? null : check(fieldPath, value);
  }

  text(maxLength: number): Check<string> {
    return (path, value) => {
      if (typeof value !== 'string') return this.add(path, issue('notText', { got: describeValue(value) }));
      if (value.trim() === '') return this.add(path, issue('emptyText', {}));
      if (value.length > maxLength) return this.add(path, issue('tooLong', { length: value.length, limit: maxLength }));
      if (UNSAFE_CHARACTERS.test(value)) return this.add(path, issue('unsafeCharacters', {}));
      return value;
    };
  }

  matching(pattern: RegExp, code: PatternCode): Check<string> {
    return (path, value) => {
      if (typeof value !== 'string') return this.add(path, issue('notText', { got: describeValue(value) }));
      return pattern.test(value) ? value : this.add(path, issue(code, { value: describeValue(value) }));
    };
  }

  readonly date: Check<string> = (path, value) => {
    const text = this.matching(DATE_PATTERN, 'notDate')(path, value);
    if (text === INVALID) return INVALID;
    if (!isCalendarDate(text)) return this.add(path, issue('notCalendarDate', { value: describeValue(text) }));
    const year = Number(text.slice(0, 4));
    if (year < LIMITS.minYear || year > LIMITS.maxYear) {
      return this.add(path, issue('yearOutOfRange', { value: describeValue(text), min: LIMITS.minYear, max: LIMITS.maxYear }));
    }
    return text;
  };

  readonly url: Check<string> = (path, value) => {
    if (typeof value !== 'string') return this.add(path, issue('notUrl', { got: describeValue(value) }));
    if (value.length > LIMITS.url) return this.add(path, issue('tooLong', { length: value.length, limit: LIMITS.url }));
    if (!URL_PATTERN.test(value)) return this.add(path, issue('notHttpUrl', { value: describeValue(value) }));
    if (!URL.canParse(value)) return this.add(path, issue('invalidUrl', { value: describeValue(value) }));
    return value;
  };

  oneOf<T extends string>(values: readonly T[]): Check<T> {
    return (path, value) => {
      const match = values.find((candidate) => candidate === value);
      return match ?? this.add(path, issue('notOneOf', { value: describeValue(value), options: values }));
    };
  }

  number(min: number, max: number, name: string): Check<number> {
    return (path, value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return this.add(path, issue('notNumber', { got: describeValue(value) }));
      if (value < min || value > max) return this.add(path, issue('numberOutOfRange', { name, value, min, max }));
      return value;
    };
  }
}

function validateBandFile(input: unknown, file: string, mode: ValidationMode): ValidationResult<DraftBandFile> {
  const c = new Collector(file);
  const root = c.record('', input, BAND_FILE_KEYS);
  if (root === INVALID) {
    return { file, value: null, issues: c.issues, totalShows: 0, rejectedShowIndexes: [] };
  }

  const schemaVersion = c.required(root, '', 'schemaVersion', (path, value) =>
    value === SCHEMA_VERSION ? SCHEMA_VERSION : c.add(path, issue('wrongSchemaVersion', { expected: SCHEMA_VERSION, got: describeValue(value) })),
  );
  const band = c.required(root, '', 'band', (path, value) => validateBand(c, path, value));
  const source = c.required(root, '', 'source', (path, value) => validateSource(c, path, value));
  const rawShows = c.required(root, '', 'shows', (path, value) => {
    if (!Array.isArray(value)) return c.add(path, issue('notList', { got: describeValue(value) }));
    if (value.length > LIMITS.showsPerFile) {
      return c.add(path, issue('tooManyShows', { count: value.length, limit: LIMITS.showsPerFile }));
    }
    return value as readonly unknown[];
  });

  if (rawShows === INVALID) {
    return { file, value: null, issues: c.issues, totalShows: 0, rejectedShowIndexes: [] };
  }

  const bandId = band === INVALID ? null : band.id;
  const accepted: { index: number; show: DraftShow }[] = [];
  const rejected: number[] = [];
  rawShows.forEach((rawShow, index) => {
    const show = validateShow(c, `shows[${index}]`, rawShow, bandId, mode);
    if (show === INVALID) rejected.push(index);
    else accepted.push({ index, show });
  });

  const firstIndexById = new Map<string, number>();
  const unique = accepted.filter(({ index, show }) => {
    if (show.id === null) return true;
    const firstIndex = firstIndexById.get(show.id);
    if (firstIndex === undefined) {
      firstIndexById.set(show.id, index);
      return true;
    }
    c.add(`shows[${index}].id`, issue('duplicateShowId', { id: show.id, firstIndex }));
    rejected.push(index);
    return false;
  });

  const fileLevelValid = schemaVersion !== INVALID && band !== INVALID && source !== INVALID;
  return {
    file,
    value: fileLevelValid ? { schemaVersion, band, source, shows: unique.map(({ show }) => show) } : null,
    issues: c.issues,
    totalShows: rawShows.length,
    rejectedShowIndexes: rejected.toSorted((a, b) => a - b),
  };
}

function validateBand(c: Collector, path: string, value: unknown): Checked<Band> {
  const record = c.record(path, value, BAND_KEYS);
  if (record === INVALID) return INVALID;
  const id = c.required(record, path, 'id', c.matching(SLUG_PATTERN, 'badBandId'));
  const name = c.required(record, path, 'name', c.text(LIMITS.bandName));
  const color = c.nullable(record, path, 'color', c.matching(COLOR_PATTERN, 'badColor'));
  const tags = c.required(record, path, 'tags', (fieldPath, value) => validateTags(c, fieldPath, value));
  const logoUrl = c.nullable(record, path, 'logoUrl', c.url);
  if (id === INVALID || name === INVALID || color === INVALID || tags === INVALID || logoUrl === INVALID) return INVALID;
  return { id, name, color, tags, logoUrl };
}

function validateTags(c: Collector, path: string, value: unknown): Checked<readonly string[]> {
  if (!Array.isArray(value)) return c.add(path, issue('notTagList', { got: describeValue(value) }));
  if (value.length > LIMITS.tagsPerBand) return c.add(path, issue('tooManyTags', { count: value.length, limit: LIMITS.tagsPerBand }));
  const issuesBefore = c.issues.length;
  const seen = new Set<string>();
  const tags: string[] = [];
  value.forEach((tag: unknown, index) => {
    const tagPath = `${path}[${index}]`;
    if (typeof tag !== 'string') c.add(tagPath, issue('notTagId', { got: describeValue(tag) }));
    else if (!isKnownTag(tag)) c.add(tagPath, issue('unknownTag', { value: describeValue(tag) }));
    else if (seen.has(tag)) c.add(tagPath, issue('duplicateTag', { value: describeValue(tag) }));
    else {
      seen.add(tag);
      tags.push(tag);
    }
  });
  return c.issues.length > issuesBefore ? INVALID : tags;
}

function validateSource(c: Collector, path: string, value: unknown): Checked<Source> {
  const record = c.record(path, value, SOURCE_KEYS);
  if (record === INVALID) return INVALID;
  const url = c.required(record, path, 'url', c.url);
  const retrievedAt = c.required(record, path, 'retrievedAt', c.date);
  if (url === INVALID || retrievedAt === INVALID) return INVALID;
  return { url, retrievedAt };
}

function validateGeo(c: Collector, path: string, value: unknown): Checked<Geo> {
  const record = c.record(path, value, GEO_KEYS);
  if (record === INVALID) return INVALID;
  const lat = c.required(record, path, 'lat', c.number(-90, 90, 'lat'));
  const lon = c.required(record, path, 'lon', c.number(-180, 180, 'lon'));
  const precision = c.required(record, path, 'precision', c.oneOf(GEO_PRECISIONS));
  const source = c.required(record, path, 'source', c.oneOf(GEO_SOURCES));
  if (lat === INVALID || lon === INVALID || precision === INVALID || source === INVALID) return INVALID;
  return { lat, lon, precision, source };
}

function validateShow(c: Collector, path: string, value: unknown, bandId: string | null, mode: ValidationMode): Checked<DraftShow> {
  const issuesBefore = c.issues.length;
  const record = c.record(path, value, SHOW_KEYS);
  if (record === INVALID) return INVALID;

  const id = c.nullable(record, path, 'id', (fieldPath, raw) => {
    const text = c.matching(/^[a-z0-9-]+$/, 'badShowIdCharacters')(fieldPath, raw);
    if (text === INVALID || bandId === null || isShowIdFormat(text, bandId)) return text;
    return c.add(fieldPath, issue('badShowIdFormat', { value: describeValue(text), bandId }));
  });
  const date = c.required(record, path, 'date', c.date);
  const endDate = c.nullable(record, path, 'endDate', c.date);
  const startTime = c.nullable(record, path, 'startTime', c.matching(TIME_PATTERN, 'badTime'));
  const tourName = c.nullable(record, path, 'tourName', c.text(LIMITS.tourName));
  const eventName = c.nullable(record, path, 'eventName', c.text(LIMITS.eventName));
  const venue = c.nullable(record, path, 'venue', c.text(LIMITS.venue));
  const city = c.required(record, path, 'city', (fieldPath, raw) => {
    const text = c.text(LIMITS.city)(fieldPath, raw);
    if (text === INVALID) return INVALID;
    try {
      baseShowId('x', '2000-01-01', text);
      return text;
    } catch (error) {
      if (error instanceof IdError) return c.add(fieldPath, error.detail);
      throw error;
    }
  });
  const region = c.nullable(record, path, 'region', c.text(LIMITS.region));
  const countryCode = c.required(record, path, 'countryCode', (fieldPath, raw) => {
    const code = c.matching(COUNTRY_PATTERN, 'badCountryFormat')(fieldPath, raw);
    if (code === INVALID) return INVALID;
    return isCountryCode(code) ? code : c.add(fieldPath, issue('unknownCountry', { value: describeValue(code) }));
  });
  const status = c.nullable(record, path, 'status', c.oneOf(SHOW_STATUSES));
  const ticketUrl = c.nullable(record, path, 'ticketUrl', c.url);
  const sourceUrl = c.nullable(record, path, 'sourceUrl', c.url);
  const notes = c.nullable(record, path, 'notes', c.text(LIMITS.notes));
  const geo = c.nullable(record, path, 'geo', (fieldPath, raw) => validateGeo(c, fieldPath, raw));

  if (date !== INVALID && endDate !== INVALID && endDate !== null) {
    const span = daysBetween(date, endDate);
    if (span < 0) c.add(`${path}.endDate`, issue('endBeforeDate', { endDate: describeValue(endDate), date: describeValue(date) }));
    else if (span > LIMITS.endDateMaxDaysAfterDate) {
      c.add(`${path}.endDate`, issue('endTooLate', { days: span, limit: LIMITS.endDateMaxDaysAfterDate }));
    }
  }
  if (mode === 'repository') {
    if (id === null) c.add(`${path}.id`, issue('missingShowId', {}));
    if (geo === null) c.add(`${path}.geo`, issue('missingGeo', {}));
  }

  if (
    c.issues.length > issuesBefore ||
    id === INVALID ||
    date === INVALID ||
    endDate === INVALID ||
    startTime === INVALID ||
    tourName === INVALID ||
    eventName === INVALID ||
    venue === INVALID ||
    city === INVALID ||
    region === INVALID ||
    countryCode === INVALID ||
    status === INVALID ||
    ticketUrl === INVALID ||
    sourceUrl === INVALID ||
    notes === INVALID ||
    geo === INVALID
  ) {
    return INVALID;
  }

  return { id, date, endDate, startTime, tourName, eventName, venue, city, region, countryCode, status, ticketUrl, sourceUrl, notes, geo };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

