import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { formatIssue, parseBandJson, validateDraft } from '../src/data/validate.ts';
import { UsageError, displayPath, expandInputs, parseArguments, readText, runCli } from './shared/files.ts';
import { LogoError, describeImage, downloadImage, logoPath, syncLogos, writePreviews, type LogoRequest } from './shared/logos.ts';
import { appendStepSummary } from './shared/report.ts';

const USAGE = `Usage: node tools/logos.ts <file|dir>... [--check] [--force] [--logos <dir>]
       node tools/logos.ts --preview <band-id> <image-url> [--out <dir>]

For every band with a logoUrl, downloads the image once, scales it down and stores it as a
black silhouette in data/logos/<band-id>.webp. Existing files are kept unless --force is given.
The app only shows stored logos; it never loads them from the original address.

  --check   change nothing; exit 1 if a band with a logoUrl has no stored logo
  --force   download again even if a logo is already stored
  --logos   directory for the logo files (default data/logos)
  --preview check one candidate image: prints format, size and transparency and writes
            <band-id>.orig.png and <band-id>.png (the silhouette) to --out (default .cache/logo-previews)`;

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), ['check', 'force', 'preview'], ['logos', 'out']);
  if (args.flags.has('preview')) return preview(args.positional, args.options.get('out') ?? '.cache/logo-previews');
  const logosDir = args.options.get('logos') ?? 'data/logos';
  const requests: LogoRequest[] = [];
  for (const path of expandInputs(args.positional)) {
    const file = displayPath(path);
    const parsed = parseBandJson(readText(path), file);
    const result = parsed.ok ? validateDraft(parsed.value, file) : null;
    const band = result?.value?.band;
    if (!parsed.ok || band === undefined) {
      for (const issue of parsed.ok ? (result?.issues ?? []) : [parsed.issue]) console.error(`ERROR ${formatIssue(issue)}`);
      continue;
    }
    if (band.logoUrl !== null) requests.push({ bandId: band.id, logoUrl: band.logoUrl });
  }

  if (args.flags.has('check')) {
    const missing = requests.filter((request) => !existsSync(logoPath(logosDir, request.bandId)));
    for (const { bandId, logoUrl } of missing) console.error(`MISSING ${logoPath(logosDir, bandId)} for ${logoUrl}; run "npm run logos"`);
    console.log(`${requests.length - missing.length} of ${requests.length} logos stored`);
    return missing.length > 0 ? 1 : 0;
  }

  mkdirSync(logosDir, { recursive: true });
  const report = await syncLogos(requests, logosDir, {
    fetch,
    userAgent: 'tour-atlas-logos/0.1 (+https://github.com)',
    force: args.flags.has('force'),
    sleep: (ms) => sleep(ms),
  });
  for (const bandId of report.written) console.log(`WROTE ${logoPath(logosDir, bandId)}`);
  for (const { bandId, reason } of report.failed) console.error(`FAILED ${bandId}: ${reason}`);
  for (const orphan of report.orphans) console.warn(`WARN  ${logosDir}/${orphan} belongs to no band with a logoUrl`);
  const summary = `${report.written.length} logos stored, ${report.skipped.length} already present, ${report.failed.length} failed`;
  console.log(`\n${summary}`);
  appendStepSummary(
    [
      '## Band logos',
      '',
      summary,
      ...report.failed.map(({ bandId, reason }) => `- ${bandId}: ${reason}. Give another image address in \`band.logoUrl\`.`),
    ].join('\n'),
  );
  return report.failed.length > 0 ? 1 : 0;
});

async function preview(positional: readonly string[], outDir: string): Promise<number> {
  const [bandId, url] = positional;
  if (bandId === undefined || url === undefined) throw new UsageError('--preview needs <band-id> <image-url>');
  mkdirSync(outDir, { recursive: true });
  try {
    const body = await downloadImage(url, { fetch, userAgent: 'tour-atlas-logos/0.1 (+https://github.com)' });
    const facts = await describeImage(body);
    const files = await writePreviews(body, outDir, bandId);
    console.log(JSON.stringify({ bandId, url, ok: true, ...facts, ...files }, null, 2));
    return 0;
  } catch (error) {
    if (!(error instanceof LogoError)) throw error;
    console.log(JSON.stringify({ bandId, url, ok: false, error: error.message }, null, 2));
    return 1;
  }
}
