import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArguments, runCli, UsageError } from './lib/files.ts';

const USAGE = `Usage: node tools/check-dist.ts <dist-dir> [--budget-kb <n>]

Checks the build output: a single self-contained index.html, no external resources,
no storage or network APIs, and a gzipped size within the budget (default 600 kB).`;

const FORBIDDEN_PATTERNS: readonly [RegExp, string][] = [
  [/<script[^>]+\bsrc=/i, 'external <script src>'],
  [/<link[^>]+\bhref=["']?(?!data:)/i, 'external <link href>'],
  [/url\(\s*["']?(?:https?:)?\/\//i, 'remote url() in CSS'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/document\.cookie/, 'document.cookie'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnew WebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bfetch\(/, 'fetch()'],
];

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), [], ['budget-kb']);
  const [distDir] = args.positional;
  if (distDir === undefined) throw new UsageError('missing <dist-dir>');
  const budgetKb = Number(args.options.get('budget-kb') ?? '600');
  if (!Number.isFinite(budgetKb) || budgetKb <= 0) throw new UsageError('--budget-kb must be a positive number');

  const problems: string[] = [];
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  const extraFiles = files.map((entry) => entry.name).filter((name) => name !== 'index.html');
  if (extraFiles.length > 0) problems.push(`expected only index.html, found also: ${extraFiles.join(', ')}`);

  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  for (const [pattern, description] of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) problems.push(`contains ${description}`);
  }
  if (!html.includes('http-equiv="Content-Security-Policy"') && process.env['TOUR_ATLAS_SKIP_CSP_CHECK'] !== '1') {
    problems.push('has no Content-Security-Policy meta tag');
  }

  const rawKb = Buffer.byteLength(html) / 1000;
  const gzipKb = gzipSync(html, { level: 9 }).byteLength / 1000;
  console.log(`index.html: ${rawKb.toFixed(1)} kB raw, ${gzipKb.toFixed(1)} kB gzipped (budget ${budgetKb} kB)`);
  if (gzipKb > budgetKb) problems.push(`gzipped size ${gzipKb.toFixed(1)} kB exceeds the budget of ${budgetKb} kB`);

  for (const problem of problems) console.error(`ERROR dist/index.html ${problem}`);
  return problems.length > 0 ? 1 : 0;
});
