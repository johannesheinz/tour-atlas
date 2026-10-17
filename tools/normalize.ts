import { writeFileSync } from 'node:fs';
import { IdError } from '../src/data/ids.ts';
import { normalizeBandFile, serializeBandFile } from '../src/data/normalize.ts';
import { parseBandJson, validateDraft } from '../src/data/validate.ts';
import { displayPath, expandInputs, parseArguments, readText, runCli } from './shared/files.ts';
import { parseFormat, printIssue } from './shared/report.ts';

const USAGE = `Usage: node tools/normalize.ts <file|dir>... [--check] [--format text|github]

Rewrites band files in canonical form: schema key order, shows sorted by date then id,
generated ids for shows without one, trimmed text, 2-space indent, trailing newline.
Files with validation errors are left untouched.

  --check           change nothing; exit 1 if any file is not in canonical form`;

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), ['check'], ['format']);
  const format = parseFormat(args.options.get('format'));
  const check = args.flags.has('check');
  let failed = 0;
  let changed = 0;

  for (const path of expandInputs(args.positional)) {
    const file = displayPath(path);
    const text = readText(path);
    const parsed = parseBandJson(text, file);
    const result = parsed.ok ? validateDraft(parsed.value, file) : null;
    const issues = parsed.ok ? (result?.issues ?? []) : [parsed.issue];
    if (issues.length > 0 || result?.value == null) {
      for (const issue of issues) printIssue(issue, 'error', format, text);
      console.error(`SKIP  ${file}: fix the errors above, then normalize again`);
      failed++;
      continue;
    }

    let normalized: string;
    try {
      normalized = serializeBandFile(normalizeBandFile(result.value));
    } catch (error) {
      if (!(error instanceof IdError)) throw error;
      printIssue({ file, path: 'shows', message: error.message }, 'error', format, text);
      failed++;
      continue;
    }

    if (normalized === text) continue;
    changed++;
    if (check) {
      const line = firstDifferentLine(text, normalized);
      printIssue({ file, path: '', message: `is not normalized (first difference at line ${line}); run "npm run normalize"` }, 'error', format, null);
    } else {
      writeFileSync(path, normalized);
      console.log(`WROTE ${file}`);
    }
  }

  const verb = check ? 'need normalizing' : 'rewritten';
  console.log(`\n${changed} files ${verb}, ${failed} skipped because of errors`);
  return failed > 0 || (check && changed > 0) ? 1 : 0;
});

function firstDifferentLine(a: string, b: string): number {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const index = aLines.findIndex((line, i) => line !== bLines[i]);
  return (index === -1 ? Math.min(aLines.length, bLines.length) : index) + 1;
}
