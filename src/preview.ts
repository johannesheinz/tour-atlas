import type { CountryLocator } from './data/countryLocator.ts';
import { diffBand, type BandDiff } from './data/diff.ts';
import { IdError } from './data/ids.ts';
import { lintBandFile, renumberShowRows } from './data/lint.ts';
import { identifyShows, normalizeBandFile, serializeBandFile } from './data/normalize.ts';
import type { BandFile, IdentifiedBandFile } from './data/types.ts';
import { acceptedRowIndexes, isCompleteShow, issue, makeIssue, parseBandJson, validateDraft, validateFileName, type ValidationIssue } from './data/validate.ts';

export const MAX_PREVIEW_BYTES = 5_000_000;

export type PreviewStatus = 'valid' | 'partial' | 'invalid';

export interface PreviewResult {
  readonly fileName: string;
  readonly status: PreviewStatus;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly totalShows: number;
  /** Valid rows in canonical form, including rows still waiting for coordinates. */
  readonly normalized: IdentifiedBandFile | null;
  /** Valid rows that can be drawn: the ones with coordinates. */
  readonly displayable: BandFile | null;
  readonly missingGeoCount: number;
  readonly diff: BandDiff | null;
}

export interface PreviewOptions {
  readonly today: string;
  readonly locateCountry: CountryLocator | null;
}

/** Runs a dropped file through the same validator, normalizer, linter and diff as the CLI tools. */
export function processPreviewFile(fileName: string, text: string, published: BandFile | undefined, options: PreviewOptions): PreviewResult {
  const invalid = (errors: readonly ValidationIssue[], totalShows = 0): PreviewResult => ({
    fileName,
    status: 'invalid',
    errors,
    warnings: [],
    totalShows,
    normalized: null,
    displayable: null,
    missingGeoCount: 0,
    diff: null,
  });

  if (text.length > MAX_PREVIEW_BYTES) {
    return invalid([makeIssue(fileName, '', issue('previewTooLarge', { megabytes: MAX_PREVIEW_BYTES / 1_000_000 }))]);
  }
  const parsed = parseBandJson(text, fileName);
  if (!parsed.ok) return invalid([parsed.issue]);

  const result = validateDraft(parsed.value, fileName);
  if (result.value === null) return invalid(result.issues, result.totalShows);

  let normalized: IdentifiedBandFile;
  try {
    normalized = normalizeBandFile(result.value);
  } catch (error) {
    if (error instanceof IdError) return invalid([...result.issues, makeIssue(fileName, 'shows', error.detail)], result.totalShows);
    throw error;
  }

  const complete = normalized.shows.filter(isCompleteShow);
  const missingGeoCount = normalized.shows.length - complete.length;
  const warnings: ValidationIssue[] = [];
  const fileNameIssue = validateFileName(fileName, normalized.band.id);
  if (fileNameIssue !== null) {
    warnings.push(makeIssue(fileNameIssue.file, fileNameIssue.path, issue('previewRenamed', { bandId: normalized.band.id })));
  }
  if (missingGeoCount > 0) {
    warnings.push(makeIssue(fileName, 'shows', issue('previewMissingCoordinates', { count: missingGeoCount })));
  }
  const inFileOrder = { ...normalized, shows: identifyShows(result.value) };
  warnings.push(...renumberShowRows(lintBandFile(fileName, inFileOrder, options), acceptedRowIndexes(result)));

  return {
    fileName,
    status: result.issues.length === 0 ? 'valid' : 'partial',
    errors: result.issues,
    warnings,
    totalShows: result.totalShows,
    normalized,
    displayable: { ...normalized, shows: complete },
    missingGeoCount,
    diff: diffBand(published ?? null, normalized),
  };
}

/** Later files for the same band replace earlier ones, as the latest drop wins. */
export function mergePreviews(existing: readonly PreviewResult[], added: readonly PreviewResult[]): PreviewResult[] {
  const bandIdOf = (preview: PreviewResult) => preview.normalized?.band.id ?? null;
  const addedIds = new Set(added.flatMap((preview) => bandIdOf(preview) ?? []));
  const addedNames = new Set(added.map((preview) => preview.fileName));
  const kept = existing.filter((preview) => {
    const bandId = bandIdOf(preview);
    return bandId === null ? !addedNames.has(preview.fileName) : !addedIds.has(bandId);
  });
  const lastPerBand = new Map<string, PreviewResult>();
  const withoutBand: PreviewResult[] = [];
  for (const preview of added) {
    const bandId = bandIdOf(preview);
    if (bandId === null) withoutBand.push(preview);
    else lastPerBand.set(bandId, preview);
  }
  return [...kept, ...lastPerBand.values(), ...withoutBand];
}

export function normalizedFileText(preview: PreviewResult): string {
  if (preview.normalized === null) throw new Error(`${preview.fileName} has no usable data to download`);
  return serializeBandFile(preview.normalized);
}

/** All bands as one JSON array: published files, with previews taking the place of their band. */
export function exportAll(published: readonly BandFile[], previews: readonly PreviewResult[]): string {
  const previewFiles = previews.flatMap((preview) => (preview.normalized === null ? [] : [preview.normalized]));
  const previewIds = new Set(previewFiles.map((file) => file.band.id));
  const files = [...published.filter((file) => !previewIds.has(file.band.id)), ...previewFiles].toSorted((a, b) =>
    a.band.id < b.band.id ? -1 : 1,
  );
  return `${JSON.stringify(files, null, 2)}\n`;
}
