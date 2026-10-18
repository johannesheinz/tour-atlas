import type { CountryLocator } from '../../src/data/countryLocator.ts';
import { lintBandFile, renumberShowRows } from '../../src/data/lint.ts';
import type { BandFileOf, IdentifiedShow } from '../../src/data/types.ts';
import {
  acceptedRowIndexes,
  parseBandJson,
  validateCollection,
  validateDraft,
  validateFileName,
  validateRepository,
  type ValidationIssue,
  type ValidationMode,
} from '../../src/data/validate.ts';
import { displayPath, readText } from './files.ts';

export interface CheckedFile {
  readonly file: string;
  readonly text: string;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly showCount: number;
  readonly value: BandFileOf<IdentifiedShow> | null;
}

export interface CheckOptions {
  readonly mode: ValidationMode;
  readonly today: string;
  readonly locateCountry: CountryLocator | null;
}

/** Validates, lints and cross-checks files exactly like CI does. */
export function checkBandFiles(paths: readonly string[], options: CheckOptions): CheckedFile[] {
  const checked = paths.map((path) => checkBandFile(path, options));
  const collectionIssues = validateCollection(
    checked.flatMap((entry) => {
      const bandId = entry.value?.band.id;
      return bandId === undefined ? [] : [{ file: entry.file, bandId }];
    }),
  );
  return checked.map((entry) => ({
    ...entry,
    errors: [...entry.errors, ...collectionIssues.filter((issue) => issue.file === entry.file)],
  }));
}

function checkBandFile(path: string, options: CheckOptions): CheckedFile {
  const file = displayPath(path);
  const text = readText(path);
  const parsed = parseBandJson(text, file);
  if (!parsed.ok) {
    return { file, text, errors: [parsed.issue], warnings: [], showCount: 0, value: null };
  }

  const result = options.mode === 'repository' ? validateRepository(parsed.value, file) : validateDraft(parsed.value, file);
  const errors = [...result.issues];
  const band = result.value?.band;
  if (band !== undefined) {
    const nameIssue = validateFileName(file, band.id);
    if (nameIssue !== null) errors.push(nameIssue);
  }

  if (result.value === null) return { file, text, errors, warnings: [], showCount: result.totalShows, value: null };

  const acceptedIndexes = acceptedRowIndexes(result);
  const rows = result.value.shows.flatMap((show, position) => {
    const fileIndex = acceptedIndexes[position];
    if (fileIndex === undefined) throw new Error(`${file}: accepted show ${position} has no row in the file`);
    return show.id === null ? [] : [{ show: { ...show, id: show.id }, fileIndex }];
  });
  const identified: BandFileOf<IdentifiedShow> = { ...result.value, shows: rows.map((row) => row.show) };
  const warnings = renumberShowRows(lintBandFile(file, identified, options), rows.map((row) => row.fileIndex));
  return { file, text, errors, warnings, showCount: result.totalShows, value: identified };
}
