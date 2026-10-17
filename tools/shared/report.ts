import { appendFileSync } from 'node:fs';
import { formatIssue, type ValidationIssue } from '../../src/data/validate.ts';
import { UsageError } from './files.ts';
import { lineForPath, locateJsonPaths } from './jsonLocate.ts';

export type OutputFormat = 'text' | 'github';
export type Severity = 'error' | 'warning';

export function parseFormat(value: string | undefined): OutputFormat {
  if (value === undefined || value === 'text') return 'text';
  if (value === 'github') return 'github';
  throw new UsageError(`--format must be "text" or "github" (got "${value}")`);
}

/** Prints one line per issue. In GitHub format the line becomes an annotation on the offending JSON line. */
export function printIssue(issue: ValidationIssue, severity: Severity, format: OutputFormat, sourceText: string | null): void {
  const label = severity === 'error' ? 'error' : 'warning';
  if (format === 'text') {
    const line = `${label === 'error' ? 'ERROR' : 'WARN '} ${formatIssue(issue)}`;
    if (severity === 'error') console.error(line);
    else console.warn(line);
    return;
  }
  const lineNumber = sourceText === null ? 1 : lineForJsonPath(sourceText, issue.path);
  const message = issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`;
  console.log(`::${label} file=${escapeProperty(issue.file)},line=${lineNumber},title=Tour data::${escapeData(message)}`);
}

export function appendStepSummary(markdown: string): void {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile !== undefined && summaryFile !== '') appendFileSync(summaryFile, `${markdown}\n`);
}

const locatedTexts = new Map<string, ReadonlyMap<string, number>>();

function lineForJsonPath(sourceText: string, path: string): number {
  let lines = locatedTexts.get(sourceText);
  if (lines === undefined) {
    try {
      lines = locateJsonPaths(sourceText);
    } catch {
      return 1;
    }
    locatedTexts.set(sourceText, lines);
  }
  return lineForPath(lines, path);
}

function escapeData(text: string): string {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(text: string): string {
  return escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function markdownCell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
