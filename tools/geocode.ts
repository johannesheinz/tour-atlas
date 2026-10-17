import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { localToday } from '../src/data/dates.ts';
import { normalizeBandFile, serializeBandFile } from '../src/data/normalize.ts';
import type { DraftShow } from '../src/data/types.ts';
import { formatIssue, parseBandJson, validateDraft } from '../src/data/validate.ts';
import { UsageError, displayPath, expandInputs, parseArguments, readText, runCli } from './lib/files.ts';
import { createGeocoder, emptyCache, parseCache, serializeCache } from './lib/geocoder.ts';

const USAGE = `Usage: NOMINATIM_CONTACT=<email or URL> node tools/geocode.ts <file|dir>... [--retry-misses] [--cache <path>]

Fills geo for shows that have none, using OpenStreetMap Nominatim: venue and city first,
then the city alone. Sends at most one request per second with an identifying User-Agent,
as the Nominatim usage policy requires, and caches every answer (including misses) in
tools/geocache.json so repeated runs do not query again. Existing coordinates are never changed.

  NOMINATIM_CONTACT   required; your email address or project URL for the User-Agent
  --retry-misses      query again for places that were not found last time
  --cache <path>      cache file (default tools/geocache.json)

Exits 1 when some shows could not be resolved; set their geo by hand with "source": "manual".`;

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), ['retry-misses'], ['cache']);
  const contact = process.env['NOMINATIM_CONTACT']?.trim() ?? '';
  if (contact === '') throw new UsageError('NOMINATIM_CONTACT is not set');
  const cachePath = args.options.get('cache') ?? 'tools/geocache.json';
  const cache = existsSync(cachePath) ? parseCache(readText(cachePath)) : emptyCache();
  const geocode = createGeocoder(cache, {
    fetch,
    sleep: (ms) => sleep(ms),
    now: () => Date.now(),
    userAgent: `tour-atlas-geocoder/0.1 (${contact})`,
    today: localToday(new Date()),
    retryMisses: args.flags.has('retry-misses'),
  });

  const unresolved: string[] = [];
  let filled = 0;
  let requests = 0;
  let failedFiles = 0;

  try {
    for (const path of expandInputs(args.positional)) {
      const file = displayPath(path);
      const parsed = parseBandJson(readText(path), file);
      const result = parsed.ok ? validateDraft(parsed.value, file) : null;
      const issues = parsed.ok ? (result?.issues ?? []) : [parsed.issue];
      if (issues.length > 0 || result?.value == null) {
        for (const issue of issues) console.error(`ERROR ${formatIssue(issue)}`);
        console.error(`SKIP  ${file}: fix the errors above first`);
        failedFiles++;
        continue;
      }

      const missing = result.value.shows.filter((show) => show.geo === null).length;
      if (missing === 0) continue;
      console.log(`${file}: ${missing} shows without coordinates`);

      const shows: DraftShow[] = [];
      for (const [index, show] of result.value.shows.entries()) {
        if (show.geo !== null) {
          shows.push(show);
          continue;
        }
        const lookup = await geocode(show);
        if (!lookup.fromCache) requests++;
        if (lookup.geo === null) {
          unresolved.push(`${file} shows[${index}]: ${[show.venue ?? show.eventName, show.city, show.region, show.countryCode].filter((part) => part !== null).join(', ')}`);
        } else {
          filled++;
          console.log(`  ${show.date} ${show.city}: ${lookup.geo.precision} precision${lookup.fromCache ? ' (cached)' : ''}`);
        }
        shows.push({ ...show, geo: lookup.geo });
      }
      writeFileSync(path, serializeBandFile(normalizeBandFile({ ...result.value, shows })));
    }
  } finally {
    writeFileSync(cachePath, serializeCache(cache));
  }

  console.log(`\nFilled ${filled} shows with ${requests} Nominatim requests. Coordinates © OpenStreetMap contributors (ODbL).`);
  if (unresolved.length > 0) {
    console.error(`\nCould not resolve ${unresolved.length} shows; set their geo by hand with "source": "manual":`);
    for (const line of unresolved) console.error(`  ${line}`);
  }
  return unresolved.length > 0 || failedFiles > 0 ? 1 : 0;
});
