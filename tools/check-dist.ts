import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArguments, runCli, UsageError } from './shared/files.ts';
import { STYLES, STYLE_FONT_FAMILIES, type Style } from '../src/data/styles.ts';
import { loadOrderProblems } from './vite/loadOrder.ts';
import { SOCIAL_CARD_FILE, socialCardProblems } from './vite/socialCard.ts';
import { WEB_APP_FILES, webAppProblems } from './vite/webApp.ts';
import { serviceWorkerProblems } from './vite/serviceWorker.ts';
import { SERVICE_WORKER_FILE } from '../src/sw/offlineCache.ts';

const USAGE = `Usage: node tools/check-dist.ts <dist-dir> [--budget-kb <n>] [--require-social-card]

Checks the build output: index.html with every script and style inlined (the stylesheet
first in <head>, the script last in <body>) plus self-hosted fonts next to it, no remote
resources, no storage or network APIs, and a transfer size
(gzipped HTML + the fonts of the heaviest style) within the budget (default 800 kB).
The web app manifest and its icons, which browsers fetch only to install the app, are
checked for what installing needs. sw.js must list exactly the files of the build and
their hash, and is the only file allowed to fetch and to use Cache Storage. Both stay
outside the budget: browsers fetch them, and the offline copy, after the page has loaded.
og-card.png, when present, must be the 1200x630 image the OpenGraph tags name; crawlers
fetch it, browsers never do, so it is outside the budget. --require-social-card fails
when the tags or the image are missing (the deploy build sets TOUR_ATLAS_SITE_URL).`;

const FONT_FILE = /^[\w.-]+\.woff2$/;
const LOGO_FILE = /^[\w.-]+\.webp$/;
const MAX_LOGO_KB = 40;

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
  [/\bcaches\.(?:open|match|keys|has|delete)\b/, 'Cache Storage'],
];

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), ['require-social-card'], ['budget-kb']);
  const [distDir] = args.positional;
  if (distDir === undefined) throw new UsageError('missing <dist-dir>');
  const budgetKb = Number(args.options.get('budget-kb') ?? '800');
  if (!Number.isFinite(budgetKb) || budgetKb <= 0) throw new UsageError('--budget-kb must be a positive number');

  const problems: string[] = [];
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(distDir, join(entry.parentPath, entry.name)));
  const fonts = files.filter((file) => FONT_FILE.test(file));
  const logos = files.filter((file) => LOGO_FILE.test(file));
  const namedFiles = [SOCIAL_CARD_FILE, ...WEB_APP_FILES, SERVICE_WORKER_FILE];
  const named = new Set(['index.html', ...namedFiles]);
  const unexpected = files.filter((file) => !named.has(file) && !FONT_FILE.test(file) && !LOGO_FILE.test(file));
  if (!files.includes('index.html')) problems.push('index.html is missing');
  if (unexpected.length > 0) problems.push(`only index.html, *.woff2 fonts, *.webp logos, ${namedFiles.join(', ')} are expected, found also: ${unexpected.join(', ')}`);
  for (const logo of logos) {
    const kb = statSync(join(distDir, logo)).size / 1000;
    if (kb > MAX_LOGO_KB) problems.push(`${logo} is ${kb.toFixed(1)} kB; logos must stay under ${MAX_LOGO_KB} kB`);
  }

  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  for (const [pattern, description] of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) problems.push(`contains ${description}`);
  }
  if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push('has no Content-Security-Policy meta tag');
  problems.push(...loadOrderProblems(html));
  const socialCard = files.includes(SOCIAL_CARD_FILE) ? readFileSync(join(distDir, SOCIAL_CARD_FILE)) : null;
  problems.push(...socialCardProblems(html, socialCard, args.flags.has('require-social-card')));
  problems.push(...webAppProblems(html, files, (file) => readFileSync(join(distDir, file))));
  problems.push(...serviceWorkerProblems(files, (file) => readFileSync(join(distDir, file))));
  if (!/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/.test(html)) problems.push('has no inline SVG favicon; browsers would request /favicon.ico');
  for (const font of fonts) {
    if (!html.includes(font)) problems.push(`${font} is not referenced by index.html`);
  }

  const styleless = fonts.filter((font) => !STYLES.some((style) => STYLE_FONT_FAMILIES[style].some((family) => font.startsWith(`${family}-`))));
  if (styleless.length > 0) problems.push(`${styleless.join(', ')} belong to no style in src/data/styles.ts, so the budget cannot count them`);
  const fontKbOf = (style: Style) =>
    fonts.filter((font) => STYLE_FONT_FAMILIES[style].some((family) => font.startsWith(`${family}-`))).reduce((sum, font) => sum + statSync(join(distDir, font)).size, 0) / 1000;
  const [heaviest] = STYLES.toSorted((a, b) => fontKbOf(b) - fontKbOf(a));
  if (heaviest === undefined) throw new Error('src/data/styles.ts lists no styles');

  const htmlGzipKb = gzipSync(html, { level: 9 }).byteLength / 1000;
  const fontKb = fontKbOf(heaviest);
  const totalKb = htmlGzipKb + fontKb;
  console.log(
    `index.html: ${(Buffer.byteLength(html) / 1000).toFixed(1)} kB raw, ${htmlGzipKb.toFixed(1)} kB gzipped; ` +
      `${fonts.length} fonts, ${fontKb.toFixed(1)} kB for the heaviest style (${heaviest}); total ${totalKb.toFixed(1)} kB (budget ${budgetKb} kB)` +
      (logos.length > 0 ? `; ${logos.length} logos load when shown` : ''),
  );
  if (totalKb > budgetKb) problems.push(`transfer size ${totalKb.toFixed(1)} kB exceeds the budget of ${budgetKb} kB`);

  for (const problem of problems) console.error(`ERROR ${distDir} ${problem}`);
  return problems.length > 0 ? 1 : 0;
});
