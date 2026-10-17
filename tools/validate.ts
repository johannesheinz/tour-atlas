import { localToday } from '../src/data/dates.ts';
import { checkBandFiles } from './shared/bandFiles.ts';
import { expandInputs, loadCountryLocator, parseArguments, runCli } from './shared/files.ts';
import { appendStepSummary, markdownCell, parseFormat, printIssue } from './shared/report.ts';

const USAGE = `Usage: node tools/validate.ts <file|dir>... [--draft] [--format text|github]

Checks band files against the schema and the semantic rules (dates, ranges, ids,
country codes, file names, duplicate band ids). Exits 1 when any file has errors.

  --draft           accept upstream output where show ids and geo are still null
  --format github   emit GitHub annotations and a job summary`;

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), ['draft'], ['format']);
  const format = parseFormat(args.options.get('format'));
  const files = expandInputs(args.positional);
  const checked = checkBandFiles(files, {
    mode: args.flags.has('draft') ? 'draft' : 'repository',
    today: localToday(new Date()),
    locateCountry: loadCountryLocator(),
  });

  for (const entry of checked) {
    for (const issue of entry.errors) printIssue(issue, 'error', format, entry.text);
    for (const issue of entry.warnings) printIssue(issue, 'warning', format, entry.text);
    if (entry.errors.length === 0) console.log(`OK    ${entry.file} (${entry.showCount} shows)`);
  }

  const errorCount = checked.reduce((sum, entry) => sum + entry.errors.length, 0);
  const warningCount = checked.reduce((sum, entry) => sum + entry.warnings.length, 0);
  const failedFiles = checked.filter((entry) => entry.errors.length > 0).length;
  console.log(`\n${checked.length} files checked: ${failedFiles} with errors, ${errorCount} errors, ${warningCount} warnings`);

  if (format === 'github') appendStepSummary(summaryMarkdown(checked));
  return errorCount > 0 ? 1 : 0;
});

function summaryMarkdown(checked: ReturnType<typeof checkBandFiles>): string {
  const rows = checked.map(
    (entry) => `| ${markdownCell(entry.file)} | ${entry.showCount} | ${entry.errors.length} | ${entry.warnings.length} |`,
  );
  const details = checked
    .filter((entry) => entry.errors.length > 0 || entry.warnings.length > 0)
    .map((entry) => {
      const lines = [
        ...entry.errors.map((issue) => `- Error: \`${issue.path || '(file)'}\` ${markdownCell(issue.message)}`),
        ...entry.warnings.map((issue) => `- Warning: \`${issue.path || '(file)'}\` ${markdownCell(issue.message)}`),
      ];
      return `### ${entry.file}\n\n${lines.join('\n')}`;
    });
  return ['## Band file validation', '', '| File | Shows | Errors | Warnings |', '| --- | ---: | ---: | ---: |', ...rows, '', ...details].join('\n');
}
