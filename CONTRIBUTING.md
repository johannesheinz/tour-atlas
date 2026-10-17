# Contributing

Tour data changes go through pull requests: one file per band in `data/bands/`, checked by CI and
reviewed by a person before it appears on the site.

## Add or update a band

1. **Produce the band file.** Usually the upstream pipeline does this: it reads the band's tour page and
   answers with JSON that matches [`schema/tour.schema.json`](schema/tour.schema.json). The fields and rules
   are in [`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md). By hand works too; copy a file from `samples/`.
   Leave `show.id` and `show.geo` as `null`, and use `null` for anything the source does not say.

2. **Save it as `data/bands/<band-id>.json`.** When updating a band, keep its past shows: they are
   history, not stale data. Future shows that disappeared from the source are not deleted silently;
   mention them in the pull request.

3. **Check the draft.**

   ```sh
   node tools/validate.ts data/bands/<band-id>.json --draft
   ```

4. **Add coordinates.** Nominatim (OpenStreetMap) asks every client to identify itself, so set a
   contact address first. Requests go out at most once per second and every answer is cached in
   `tools/geocache.json`; commit that file too.

   ```sh
   NOMINATIM_CONTACT="you@example.org" npm run geocode
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

## What CI checks

| Check | Fails the pull request? |
| --- | --- |
| Schema and semantic validation of every file in `data/bands/` (annotated on the offending line) | yes |
| Canonical formatting (`normalize --check`) | yes |
| Data review: shows added, removed and changed per band, plus plausibility warnings, in the job summary | no |
| Typecheck, unit tests, build | yes |
| Size budget: build with 50 bands and 5,000 synthetic shows must stay under 600 kB gzipped | yes |

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
