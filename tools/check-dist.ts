import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArguments, runCli, UsageError } from './shared/files.ts';

const USAGE = `Usage: node tools/check-dist.ts <dist-dir> [--budget-kb <n>]

Checks the build output: index.html with every script and style inlined plus self-hosted
fonts next to it, no remote resources, no storage or network APIs, and a transfer size
(gzipped HTML + fonts) within the budget (default 600 kB).`;

const FONT_FILE = /^[\w.-]+\.woff2$/;

const FORBIDDEN_PATTERNS: readonly [RegExp, string][] = [
  [/<script[^>]+\bsrc=/i, 'external <script src>'],
  [/<link[^>]+\bhref=["']?(?:https?:)?\/\//i, 'remote <link href>'],
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
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(distDir, join(entry.parentPath, entry.name)));
  const fonts = files.filter((file) => FONT_FILE.test(file));
  const unexpected = files.filter((file) => file !== 'index.html' && !FONT_FILE.test(file));
  if (!files.includes('index.html')) problems.push('index.html is missing');
  if (unexpected.length > 0) problems.push(`only index.html and *.woff2 fonts are expected, found also: ${unexpected.join(', ')}`);

  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  for (const [pattern, description] of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) problems.push(`contains ${description}`);
  }
  if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push('has no Content-Security-Policy meta tag');
  for (const font of fonts) {
    if (!html.includes(font)) problems.push(`${font} is not referenced by index.html`);
  }

  const htmlGzipKb = gzipSync(html, { level: 9 }).byteLength / 1000;
  const fontKb = fonts.reduce((sum, font) => sum + statSync(join(distDir, font)).size, 0) / 1000;
  const totalKb = htmlGzipKb + fontKb;
  console.log(
    `index.html: ${(Buffer.byteLength(html) / 1000).toFixed(1)} kB raw, ${htmlGzipKb.toFixed(1)} kB gzipped; ` +
      `${fonts.length} fonts: ${fontKb.toFixed(1)} kB; total ${totalKb.toFixed(1)} kB (budget ${budgetKb} kB)`,
  );
  if (totalKb > budgetKb) problems.push(`transfer size ${totalKb.toFixed(1)} kB exceeds the budget of ${budgetKb} kB`);

  for (const problem of problems) console.error(`ERROR ${distDir} ${problem}`);
  return problems.length > 0 ? 1 : 0;
});
