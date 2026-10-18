/** A value as an issue message mentions it; strings and numbers verbatim, the rest by kind so each language can name it. */
export type ValueDescription =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'null' }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'list' }
  | { readonly kind: 'object' };

type V = ValueDescription;

/** Every problem the validator, lint and preview report, with what its message needs. */
export interface IssueParams {
  notObject: { got: V };
  unknownField: Record<string, never>;
  missing: Record<string, never>;
  missingUseNull: Record<string, never>;
  notText: { got: V };
  emptyText: Record<string, never>;
  tooLong: { length: number; limit: number };
  unsafeCharacters: Record<string, never>;
  notDate: { value: V };
  notCalendarDate: { value: V };
  yearOutOfRange: { value: V; min: number; max: number };
  notUrl: { got: V };
  notHttpUrl: { value: V };
  invalidUrl: { value: V };
  notOneOf: { value: V; options: readonly string[] };
  notNumber: { got: V };
  numberOutOfRange: { name: string; value: number; min: number; max: number };
  wrongSchemaVersion: { expected: number; got: V };
  notList: { got: V };
  tooManyShows: { count: number; limit: number };
  duplicateShowId: { id: string; firstIndex: number };
  badBandId: { value: V };
  badColor: { value: V };
  badShowIdCharacters: { value: V };
  badShowIdFormat: { value: V; bandId: string };
  badTime: { value: V };
  badCountryFormat: { value: V };
  unknownCountry: { value: V };
  notTagList: { got: V };
  tooManyTags: { count: number; limit: number };
  notTagId: { got: V };
  unknownTag: { value: V };
  duplicateTag: { value: V };
  cityWithoutLatin: { city: string };
  endBeforeDate: { endDate: V; date: V };
  endTooLate: { days: number; limit: number };
  missingShowId: Record<string, never>;
  missingGeo: Record<string, never>;
  invalidJson: { reason: string };
  wrongFileName: { expected: string };
  duplicateBandId: { bandId: string; firstFile: string };
  notNormalized: { line: number };
  previewTooLarge: { megabytes: number };
  previewRenamed: { bandId: string };
  previewMissingCoordinates: { count: number };
  sourceInFuture: Record<string, never>;
  sourceStale: { days: number };
  farFuture: Record<string, never>;
  wrongCountry: { found: string; countryCode: string };
  duplicateShow: { earlier: string };
  sameDayFarApart: { earlier: string; city: string; km: number };
}

export type IssueCode = keyof IssueParams;

export type IssueDetail = { [K in IssueCode]: { readonly code: K; readonly params: IssueParams[K] } }[IssueCode];

export type IssueTexts = { readonly [K in IssueCode]: (params: IssueParams[K]) => string } & {
  readonly value: (value: ValueDescription) => string;
};

export function describeValue(value: unknown): ValueDescription {
  if (typeof value === 'string') return { kind: 'literal', text: JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}...` : value) };
  if (value === null) return { kind: 'null' };
  if (value === undefined) return { kind: 'nothing' };
  if (Array.isArray(value)) return { kind: 'list' };
  if (typeof value === 'object') return { kind: 'object' };
  return { kind: 'literal', text: String(value) };
}

export function issueText(texts: IssueTexts, detail: IssueDetail): string {
  // Each code's params belong to that code, which a lookup by a union-typed key cannot express.
  const render = texts[detail.code] as (params: IssueParams[IssueCode]) => string;
  return render(detail.params);
}

export const ENGLISH_ISSUES: IssueTexts = {
  value: (value) => {
    switch (value.kind) {
      case 'literal':
        return value.text;
      case 'null':
        return 'null';
      case 'nothing':
        return 'nothing';
      case 'list':
        return 'a list';
      case 'object':
        return 'an object';
    }
  },
  notObject: ({ got }) => `must be an object (got ${ENGLISH_ISSUES.value(got)})`,
  unknownField: () => 'unknown field',
  missing: () => 'missing',
  missingUseNull: () => 'missing (use null when unknown)',
  notText: ({ got }) => `must be text (got ${ENGLISH_ISSUES.value(got)})`,
  emptyText: () => 'is empty (use null when unknown)',
  tooLong: ({ length, limit }) => `is ${length} characters long; the limit is ${limit}`,
  unsafeCharacters: () => 'contains control or text-direction characters',
  notDate: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not YYYY-MM-DD`,
  notCalendarDate: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not a real calendar date`,
  yearOutOfRange: ({ value, min, max }) => `${ENGLISH_ISSUES.value(value)} is outside the years ${min}–${max}`,
  notUrl: ({ got }) => `must be a URL (got ${ENGLISH_ISSUES.value(got)})`,
  notHttpUrl: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not an http(s) URL`,
  invalidUrl: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not a valid URL`,
  notOneOf: ({ value, options }) => `${ENGLISH_ISSUES.value(value)} is not one of ${options.join(', ')}`,
  notNumber: ({ got }) => `must be a number (got ${ENGLISH_ISSUES.value(got)})`,
  numberOutOfRange: ({ name, value, min, max }) => `${name} ${value} is outside ${min}…${max}`,
  wrongSchemaVersion: ({ expected, got }) => `must be ${expected} (got ${ENGLISH_ISSUES.value(got)})`,
  notList: ({ got }) => `must be a list (got ${ENGLISH_ISSUES.value(got)})`,
  tooManyShows: ({ count, limit }) => `has ${count} shows; the limit per file is ${limit}`,
  duplicateShowId: ({ id, firstIndex }) => `duplicate id "${id}" (also used by shows[${firstIndex}])`,
  badBandId: ({ value }) => `${ENGLISH_ISSUES.value(value)} must be a lowercase slug like "glass-harbor"`,
  badColor: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not a lowercase hex colour like "#3a7bd5"`,
  badShowIdCharacters: ({ value }) => `${ENGLISH_ISSUES.value(value)} must contain only a–z, 0–9 and hyphens`,
  badShowIdFormat: ({ value, bandId }) => `${ENGLISH_ISSUES.value(value)} must look like "${bandId}-YYYY-MM-DD-<city>"`,
  badTime: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not HH:MM (24-hour clock)`,
  badCountryFormat: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not a two-letter uppercase country code`,
  unknownCountry: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not an ISO 3166-1 alpha-2 country code`,
  notTagList: ({ got }) => `must be a list of tag ids (got ${ENGLISH_ISSUES.value(got)}); use [] for none`,
  tooManyTags: ({ count, limit }) => `has ${count} tags; the limit is ${limit}`,
  notTagId: ({ got }) => `must be a tag id (got ${ENGLISH_ISSUES.value(got)})`,
  unknownTag: ({ value }) => `${ENGLISH_ISSUES.value(value)} is not in data/tags.json; add it there in the same pull request or remove it`,
  duplicateTag: ({ value }) => `${ENGLISH_ISSUES.value(value)} is listed twice`,
  cityWithoutLatin: ({ city }) => `city "${city}" has no Latin letters or digits to build an id from; use the Latin-script name`,
  endBeforeDate: ({ endDate, date }) => `${ENGLISH_ISSUES.value(endDate)} is before date ${ENGLISH_ISSUES.value(date)}`,
  endTooLate: ({ days, limit }) => `is ${days} days after date; the limit is ${limit}`,
  missingShowId: () => 'missing; run "npm run normalize" to generate it',
  missingGeo: () => 'missing coordinates; run "npm run geocode"',
  invalidJson: ({ reason }) => `is not valid JSON (${reason})`,
  wrongFileName: ({ expected }) => `file name must be "${expected}" to match band.id`,
  duplicateBandId: ({ bandId, firstFile }) => `"${bandId}" is already used by ${firstFile}`,
  notNormalized: ({ line }) => `is not normalized (first difference at line ${line}); run "npm run normalize"`,
  previewTooLarge: ({ megabytes }) => `is larger than ${megabytes} MB; split it into one file per band`,
  previewRenamed: ({ bandId }) => `will be downloaded as "${bandId}.json" to match band.id`,
  previewMissingCoordinates: ({ count }) =>
    `${count} ${count === 1 ? 'show has' : 'shows have'} no coordinates yet and ${count === 1 ? 'is' : 'are'} not drawn; run "npm run geocode" before committing`,
  sourceInFuture: () => 'is in the future',
  sourceStale: ({ days }) => `is ${days} days old; refresh the data from source.url`,
  farFuture: () => 'is more than three years ahead; check the year',
  wrongCountry: ({ found, countryCode }) => `coordinates fall inside ${found}, but countryCode is ${countryCode}`,
  duplicateShow: ({ earlier }) => `looks like a duplicate of ${earlier} (same date, city and venue)`,
  sameDayFarApart: ({ earlier, city, km }) => `same day as ${earlier} (${city}) but ${km} km away; check the date`,
};
