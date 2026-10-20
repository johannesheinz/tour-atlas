# Tour Atlas

Static web app: concert tour dates of many bands on a world map with an aligned, zoomable timeline.
No backend, no runtime network requests. Band data lives in `data/bands/*.json`, is produced upstream
(LLM pipeline), reviewed via pull requests, and inlined into `dist/index.html`; only the self-hosted
`.woff2` fonts and the band logo `.webp` files ship as separate files next to it (`tools/vite/hostedAssets.ts`),
plus `og-card.png` for link previews when the build has `TOUR_ATLAS_SITE_URL` (`tools/vite/socialCard.ts`).

## Commands

```sh
npm run dev            # Vite dev server
npm run build          # inlined build + fonts, then dist checks (CSP, no remote resources, size)
npm run preview        # serve dist/ on http://localhost:4173
npm run build:budget   # build with a synthetic 50 bands / 5,000 shows dataset, must stay < 800 kB gzipped
npm test               # Vitest
npm run typecheck      # app (DOM) and node (tools/tests) projects separately
npm run validate       # tools/validate.ts data/bands  (errors fail, warnings inform)
npm run normalize      # rewrite data/bands in canonical form; add --check to only verify
npm run geocode        # fill missing geo via Nominatim; reads NOMINATIM_CONTACT from .env.local (ask the user)
npm run review -- --base origin/main   # diff + plausibility warnings, as posted by CI
npm run tags           # copy data/tags.json ids into the schema's band.tags enum
npm run logos          # download band.logoUrl images once into data/logos/<id>.webp (silhouettes)
npm run logo:preview -- <band-id> <url>   # check a candidate logo; previews in .cache/logo-previews
npm run demo-video     # build, then record docs/demo.mp4 + docs/demo-poster.jpg (needs ffmpeg and a Playwright Chromium)
npm run og-card        # rebuild src/brand/og-card.svg/.png (the social card image); commit both
npm run check          # everything CI runs, in order
```

## Architecture

- `src/data/` is pure TypeScript shared by the app, the CLI tools and the build: no DOM, no Node APIs, no I/O.
  `tsconfig.node.json` (no DOM lib) and `tsconfig.app.json` (no Node types) both compile it, which enforces that.
  - `validate.ts` is the single validator. `validateDraft` (ids/geo may be null) for upstream output,
    `validateRepository` for `data/bands/`. Returns per-row issues and keeps valid rows. Reuse it for any
    future upload path; do not write a second validator.
  - `lint.ts`: non-blocking plausibility warnings (coordinates in another country, same-day shows far apart, stale source).
  - `tags.ts`: loads and checks the fixed tag list `data/tags.json`; the validator rejects unknown tags.
  - `ids.ts`, `normalize.ts`, `diff.ts`, `palette.ts`, `countries.ts`, `countryLocator.ts`, `dates.ts`.
- `schema/tour.schema.json` mirrors the validator. `tests/data/schema.test.ts` enforces key order, the
  structured-output keyword subset, and that the validator rejects everything the schema rejects.
  Change both together (see `.claude/skills/change-schema`).
- `src/store/`: `DataStore` interface (`listBands`, `getBand`, `subscribe`); only `StaticStore` exists.
- `src/view/`: render functions of state + callbacks. Pure math (fits, scales) lives in DOM-free modules so it is testable in Node.
- `src/preview.ts`: in-browser preview of dropped files (validate, normalize, lint, diff, export). Held in memory only.
- `src/i18n/`: interface texts per language (`en`, `de`, `fr`, `es`, `sv`, `fi`, `la`, `eo`) against the typed `Messages`; the locale is
  picked once at start-up from `lang=`/`clock=`/`units=` in the URL or the browser, and changing it reloads the page.
  Distances show in km, miles (US region) or Swedish mil (Swedish), via `formats().distance`.
  Validation issues carry a code (`src/data/issues.ts`) so the app can translate them; tools print English.
  Browsers have no Latin or Esperanto data, so `la.ts`/`eo.ts` carry their own month, weekday and country names
  (`FormatWords`), formatted in en-GB's shape by `src/i18n/formats.ts`.
- Styles: `src/data/styles.ts` lists the four styles (Stage lights is the default) and the fonts each downloads;
  `src/styles.css` sets every token per style, light and dark, and `tests/view/styles.test.ts` checks that each
  style sets them all and meets WCAG AA contrast. Components use tokens only, never a style's colours directly.
- `src/main.ts` wires views to `src/state.ts`; `src/appState.ts` and `src/selectors.ts` memoise derived data.
- `tools/`: Node CLIs (TypeScript run directly by Node's type stripping, so use `.ts` import specifiers and
  erasable syntax only); never shipped. `tools/vite/` holds the build plugins (data validation, CSP, slim topology,
  brand mark and inline favicon from `src/brand/`, social card, logo sizes read from the `.webp` headers).
- Social card: `TOUR_ATLAS_SITE_URL` (absolute `https:`, ending in `/`, no default) turns on the OpenGraph/Twitter
  tags (texts in the `<!-- social-card -->` block of `index.html`) and `og-card.png` in dist; unset means neither,
  anything else set fails the build. `check-dist` allows exactly `og-card.png` (1200x630, < 300 kB, named by
  `og:image`, outside the budget); `--require-social-card` makes it mandatory (deploy and the CI card build).
- Load order: `tools/vite/loadOrder.ts` puts the inlined `<style>` first in `<head>` and the module script at the end of
  `<body>` (check-dist enforces it), so slow connections paint the header and the loading note at once.
  `<html class="is-loading">` hides the half-built interface until `src/startup.ts` ends it after the first render;
  a start-up error shows `page.startupFailed` instead.
- `src/share.ts` builds share links from the current state, without `lang`/`clock`/`units`; `src/view/sharePanel.ts` is the popover.

## Skills

Only for work that needs judgement; everything checkable is a tool or a CI job.

- `.claude/skills/band-data`: create or refresh a band file from a tour page
- `.claude/skills/band-logo`: find a band's logo and check it as the silhouette the app shows
- `.claude/skills/fix-data-errors`: fix what validate, geocode or the data review report
- `.claude/skills/change-schema`: change the format consistently everywhere

## Hard rules

- Runtime dependencies are an allowlist: d3-geo, d3-scale, d3-time, d3-zoom, d3-selection,
  d3-transition, d3-quadtree, topojson-client, world-atlas, @fontsource/league-gothic, @fontsource/archivo,
  @fontsource/jost, @fontsource/charis-sil.
  Justify any addition in the PR. `sharp` is a dev dependency for tools/logos.ts and tools/og-card.ts only; it never runs at build time and never reaches the bundle.
  `playwright-core` is a dev dependency for tools/demo-video.ts only, likewise.
- No network at runtime, no CDNs, no cookies, no localStorage/sessionStorage/IndexedDB. View state lives in
  the URL hash only. `tools/check-dist.ts` fails the build otherwise; the CSP sets `connect-src 'none'` and
  `font-src 'self'`.
- Never use `innerHTML` with data. Render text with `textContent`; links only for http(s) URLs with
  `rel="noopener noreferrer"`.
- Unknown data is `null`, never guessed. Never invent tour dates; sample data uses fictional bands and
  `example.com`/`example.org` URLs.
- Keep the transfer size (gzipped `dist/index.html` plus the fonts of the heaviest style) under 800 kB at 50 bands / 5,000 shows.
  Every hosted font belongs to a style in `src/data/styles.ts`; browsers download only the active style's fonts.
- Never send requests to Nominatim from tests or CI; tests inject a fake fetch.
- Comments only where the code cannot say it; prefer descriptive names.
- No interface text in code: add it to `src/i18n/messages.ts` and every catalog. Dates, times and place
  names go through `src/view/format.ts` (Intl in the active locale, own words for Latin and Esperanto), never hand-built.
