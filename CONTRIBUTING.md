# Contributing

Tour data changes go through pull requests: one file per band in `data/bands/`, checked by CI and
reviewed by a person before it appears on the site.

## Add or update a band

1. **Produce the band file.** Usually the upstream pipeline does this: it reads the band's tour page and
   answers with JSON that matches [`schema/tour.schema.json`](schema/tour.schema.json). The fields and rules
   are in [`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md). By hand works too; copy a file from `samples/`.
   Leave `show.id` and `show.geo` as `null`, and use `null` for anything the source does not say.
   Pick `band.tags` from [`data/tags.json`](data/tags.json) only, or leave it `[]`.

2. **Save it as `data/bands/<band-id>.json`.** When updating a band, keep its past shows: they are
   history, not stale data. Future shows that disappeared from the source are not deleted silently;
   mention them in the pull request.

3. **Check the draft.**

   ```sh
   node tools/validate.ts data/bands/<band-id>.json --draft
   ```

4. **Add coordinates.** Nominatim (OpenStreetMap) asks every client to identify itself, so set a
   contact address first (see [Geocoding contact](#geocoding-contact)). Requests go out at most once
   per second and every answer is cached in `tools/geocache.json`; commit that file too.

   ```sh
   npm run geocode
   ```

   Shows it cannot resolve are listed. Look up their coordinates yourself, set
   `"geo": { "lat": …, "lon": …, "precision": "city", "source": "manual" }` and say so in the pull request.

5. **Normalize and validate.**

   ```sh
   npm run normalize
   npm run validate
   ```

   Errors name the file, the row and the field, for example
   `data/bands/glass-harbor.json shows[12].date: "17 Oct" is not YYYY-MM-DD`. Warnings point at things
   that look wrong but may be right; check them.

6. **Look at it.** Run `npm run dev`, or open a built `dist/index.html`, and drop the file onto the page.
   The preview shows what changed against the published data. Nothing leaves your browser.

7. **Open a pull request.** The template has a short checklist.

## Geocoding contact

`tools/geocode.ts` refuses to run without `NOMINATIM_CONTACT`: the Nominatim usage policy requires that the
operator can reach whoever sends the requests. It goes into the User-Agent header and nowhere else.

- **Locally:** `cp .env.example .env.local` and put your address in it. `.env.local` is git-ignored and
  `npm run geocode` loads it (`node --env-file-if-exists`). A one-off `NOMINATIM_CONTACT=… npm run geocode`
  works too.
- **GitHub Actions:** CI never geocodes. If a workflow ever should (say, a manual "geocode this pull
  request" job), store the address under Settings → Secrets and variables → Actions, as a variable if it may
  appear in logs or as a secret if not, and pass it with `env: NOMINATIM_CONTACT: ${{ vars.NOMINATIM_CONTACT }}`
  (or `secrets.`). Use a project address, not a personal one.
- **Production, if uploads arrive one day:** geocoding has to run on the server, never in the browser. The
  CSP blocks it anyway, and the contact would leak. Set the variable with the platform's secret store
  (`firebase functions:secrets:set NOMINATIM_CONTACT`, `supabase secrets set NOMINATIM_CONTACT=…`), send
  requests through one queue at no more than 1 per second for the whole service, and keep the cache. The
  public Nominatim server is meant for low, occasional use; with real upload traffic, run your own Nominatim
  or switch to a provider whose terms allow storing results. The simpler option is to keep geocoding in the
  review step: uploads arrive as drafts and a maintainer or a scheduled job geocodes them.

## Add a logo

Put the address of the logo image in `band.logoUrl` (SVG is best, then a PNG with a transparent
background). Check a candidate first with `npm run logo:preview -- <band-id> '<url>'`, which shows the
silhouette the app will print. On a pull request the "Logos" workflow downloads it, converts it and commits
`data/logos/<band-id>.webp` to your branch. Locally: `npm run logos`. If the download fails, the job
says why; give another address. The app never loads logos from the original address.

## Add a tag

Add it to `data/tags.json` (id, label, group), run `npm run tags` to update the schema, and commit both
in the pull request that first uses the tag.

## Translations

The interface speaks English, German, French, Spanish, Swedish, Finnish, Latin and Esperanto. Every text lives in
one file per language in `src/i18n/` (`en.ts`, `de.ts`, `fr.ts`, `es.ts`, `sv.ts`, `fi.ts`, `la.ts`, `eo.ts`),
shaped by the `Messages` interface in `src/i18n/messages.ts`.

- **New text:** add a key to `Messages`, then to every language file. The typecheck fails until all of them have
  it. Counts use `n(count, { one: '# show', other: '# shows' })`, which follows each language's plural rules.
- **Dates, times, month and weekday names, countries and regions** come from the browser (`Intl`) in the active
  locale; never write them into a catalog. Format through `src/view/format.ts`. The exception is Latin and
  Esperanto, which browsers do not know: `la.ts` and `eo.ts` carry their own month, weekday and day-period
  names, list conjunction and a name for every country code (`FormatWords` in `src/i18n/formats.ts`), set in
  en-GB's day-month-year shape, and count with English plural rules.
- **Validation messages** have English texts in `src/data/issues.ts` (the command-line tools print those) and
  translations in each catalog's `issues` section.
- **Static markup** in `index.html` names its text with `data-i18n`, `data-i18n-label` or `data-i18n-title`.
- **New language:** add it to `LANGUAGES`, `LANGUAGE_NAMES` and the default regions in `src/i18n/locale.ts`, add
  a catalog, and register it in `src/i18n/index.ts`. Check that browsers have `Intl` data for it; if not, give
  it `FormatWords` like Latin and Esperanto.

Band data (names, venues, tours, notes) and genre names are not translated.

## What CI checks

| Check | Fails the pull request? |
| --- | --- |
| Schema and semantic validation of every file in `data/bands/` (annotated on the offending line) | yes |
| Canonical formatting (`normalize --check`) | yes |
| Schema tag list matches `data/tags.json` (`tags --check`) | yes |
| Data review: shows added, removed and changed per band, plus plausibility warnings, in the job summary | no |
| Typecheck, unit tests, build | yes |
| Size budget: build with 50 bands and 5,000 synthetic shows must stay under 650 kB gzipped (HTML plus the fonts of the heaviest style) | yes |

## Code changes

```sh
npm ci
npm run check   # typecheck, validate, normalize --check, tests, build
```

- Runtime dependencies are an allowlist (see `CLAUDE.md`). Justify any addition in the pull request.
- The app makes no network requests and stores nothing on the device. `tools/check-dist.ts` fails the
  build if a storage or network API shows up in the bundle.
- The validator in `src/data/validate.ts` is the only validator. The CLI tools, the build and the
  in-app preview all call it; future upload paths must too.
- Format changes: follow `.claude/skills/change-schema/SKILL.md`.
