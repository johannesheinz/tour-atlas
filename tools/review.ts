import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { localToday } from '../src/data/dates.ts';
import { diffBand, hasChanges, type BandDiff } from '../src/data/diff.ts';
import { lintBandFile } from '../src/data/lint.ts';
import type { BandFileOf, IdentifiedShow } from '../src/data/types.ts';
import { parseBandJson, validateRepository, type ValidationIssue } from '../src/data/validate.ts';
import { UsageError, loadCountryLocator, parseArguments, readText, runCli } from './lib/files.ts';
import { appendStepSummary, markdownCell, printIssue } from './lib/report.ts';

const USAGE = `Usage: node tools/review.ts --base <git-ref> [--format text|github]

Summarises changes to data/bands/ between <git-ref> and the working tree for pull request
review: shows added, removed and changed per band, plus plausibility warnings. Never fails
on warnings; schema errors are the job of tools/validate.ts.`;

const DATA_DIR = 'data/bands';

interface BandReview {
  readonly path: string;
  readonly bandName: string;
  readonly diff: BandDiff | null;
  readonly deleted: boolean;
  readonly warnings: readonly ValidationIssue[];
  readonly headText: string | null;
}

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), [], ['base', 'format']);
  const base = args.options.get('base');
  if (base === undefined) throw new UsageError('--base is required');
  const format = args.options.get('format') === 'github' ? 'github' : 'text';
  const options = { today: localToday(new Date()), locateCountry: loadCountryLocator() };

  const reviews = changedBandFiles(base).map((path): BandReview => {
    const before = loadVersion(gitShow(base, path), path);
    const headText = existsSync(path) ? readText(path) : null;
    const after = loadVersion(headText, path);
    if (after === null) {
      return { path, bandName: before?.band.name ?? path, diff: null, deleted: headText === null, warnings: [], headText };
    }
    return {
      path,
      bandName: after.band.name,
      diff: diffBand(before, after),
      deleted: false,
      warnings: lintBandFile(path, after, options),
      headText,
    };
  });

  const markdown = renderMarkdown(base, reviews);
  if (format === 'github') {
    for (const review of reviews) {
      for (const warning of review.warnings) printIssue(warning, 'warning', 'github', review.headText);
    }
    appendStepSummary(markdown);
  }
  console.log(markdown);
  return 0;
});

function changedBandFiles(base: string): string[] {
  const output = execFileSync('git', ['diff', '--name-only', '--no-renames', base, '--', DATA_DIR], { encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', DATA_DIR], { encoding: 'utf8' });
  return [...new Set([...output.split('\n'), ...untracked.split('\n')])].filter((path) => path.endsWith('.json')).toSorted();
}

function gitShow(base: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function loadVersion(text: string | null, path: string): BandFileOf<IdentifiedShow> | null {
  if (text === null) return null;
  const parsed = parseBandJson(text, path);
  return parsed.ok ? validateRepository(parsed.value, path).value : null;
}

function renderMarkdown(base: string, reviews: readonly BandReview[]): string {
  if (reviews.length === 0) return `## Tour data review\n\nNo changes to ${DATA_DIR}/ compared with \`${base}\`.`;

  const rows = reviews.map((review) => {
    const cells = review.diff === null
      ? [review.deleted ? 'deleted' : 'invalid, see validation', '', '', '']
      : [review.diff.isNewBand ? 'new band' : 'updated', String(review.diff.added.length), String(review.diff.removed.length), String(review.diff.changed.length)];
    return `| ${markdownCell(review.bandName)} | ${cells.join(' | ')} | ${review.warnings.length} |`;
  });

  const sections = reviews.flatMap((review) => {
    if (review.diff === null || (!hasChanges(review.diff) && review.warnings.length === 0)) return [];
    const { diff } = review;
    const lines = [
      ...diff.bandFields.map((field) => `- Band ${field} changed`),
      ...diff.added.map((show) => `- Added ${describeShow(show)}`),
      ...diff.removed.map((show) => `- Removed ${describeShow(show)}`),
      ...diff.changed.map((change) => `- Changed ${describeShow(change.after)}: ${change.fields.map((field) => describeField(change.before, change.after, field)).join('; ')}`),
      ...review.warnings.map((warning) => `- Warning: \`${warning.path}\` ${markdownCell(warning.message)}`),
    ];
    return [`### ${markdownCell(review.bandName)} (\`${review.path}\`)`, '', ...lines, ''];
  });

  return [
    '## Tour data review',
    '',
    `Compared with \`${base}\`.`,
    '',
    '| Band | Change | Added | Removed | Changed | Warnings |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    ...sections,
  ].join('\n');
}

function describeShow(show: IdentifiedShow): string {
  const place = [show.venue, show.city, show.countryCode].filter((part) => part !== null).join(', ');
  return `${show.date} ${markdownCell(place)}`;
}

function describeField(before: IdentifiedShow, after: IdentifiedShow, field: keyof IdentifiedShow): string {
  const format = (value: unknown) => (value === null ? 'none' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  return `${field} ${markdownCell(format(before[field]))} to ${markdownCell(format(after[field]))}`;
}
