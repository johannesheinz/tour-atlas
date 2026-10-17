# Tour Atlas

Static web app: concert tour dates of many bands on a world map with an aligned, zoomable timeline.
No backend, no runtime network requests. Band data lives in `data/bands/*.json`, is produced upstream
(LLM pipeline), reviewed via pull requests, and inlined into a single `dist/index.html`.

## Commands

```sh
npm run dev            # Vite dev server
npm run build          # single-file build + dist checks (CSP, no external resources, size)
npm run build:budget   # build with a synthetic 50 bands / 5,000 shows dataset, must stay < 600 kB gzipped
npm test               # Vitest
npm run typecheck      # app (DOM) and node (tools/tests) projects separately
npm run validate       # tools/validate.ts data/bands  (errors fail, warnings inform)
npm run normalize      # rewrite data/bands in canonical form; add --check to only verify
NOMINATIM_CONTACT=... npm run geocode   # fill missing geo via Nominatim; ask the user for the contact
npm run review -- --base origin/main   # diff + plausibility warnings, as posted by CI
npm run check          # everything CI runs, in order
```

## Architecture

- `src/data/` is pure TypeScript shared by the app, the CLI tools and the build: no DOM, no Node APIs, no I/O.
  `tsconfig.node.json` (no DOM lib) and `tsconfig.app.json` (no Node types) both compile it, which enforces that.
  - `validate.ts` is the single validator. `validateDraft` (ids/geo may be null) for upstream output,
    `validateRepository` for `data/bands/`. Returns per-row issues and keeps valid rows. Reuse it for any
    future upload path; do not write a second validator.
  - `lint.ts`: non-blocking plausibility warnings (coordinates in another country, same-day shows far apart, stale source).
  - `ids.ts`, `normalize.ts`, `diff.ts`, `palette.ts`, `countries.ts`, `countryLocator.ts`, `dates.ts`.
- `schema/tour.schema.json` mirrors the validator. `tests/data/schema.test.ts` enforces key order, the
  structured-output keyword subset, and that the validator rejects everything the schema rejects.
  Change both together (see `.claude/skills/change-schema`).
- `src/store/`: `DataStore` interface (`listBands`, `getBand`, `subscribe`); only `StaticStore` exists.
- `src/view/`: render functions of state + callbacks. Pure math (fits, scales) lives in DOM-free modules so it is testable in Node.
- `src/preview.ts`: in-browser preview of dropped files (validate, normalize, lint, diff, export). Held in memory only.
- `src/main.ts` wires views to `src/state.ts`; `src/appState.ts` and `src/selectors.ts` memoise derived data.
- `tools/`: Node CLIs (TypeScript run directly by Node's type stripping, so use `.ts` import specifiers and
  erasable syntax only); never shipped. `tools/vite/` holds the build plugins (data validation, CSP, slim topology).

## Skills

Only for work that needs judgement; everything checkable is a tool or a CI job.

- `.claude/skills/band-data`: create or refresh a band file from a tour page
- `.claude/skills/fix-data-errors`: fix what validate, geocode or the data review report
- `.claude/skills/change-schema`: change the format consistently everywhere

## Hard rules

- Runtime dependencies are an allowlist: d3-geo, d3-scale, d3-time, d3-time-format, d3-zoom, d3-selection,
  d3-transition, d3-quadtree, topojson-client, world-atlas, @fontsource/league-gothic, @fontsource/archivo.
  Justify any addition in the PR.
- No network at runtime, no CDNs, no cookies, no localStorage/sessionStorage/IndexedDB. View state lives in
  the URL hash only. `tools/check-dist.ts` fails the build otherwise; the CSP sets `connect-src 'none'`.
- Never use `innerHTML` with data. Render text with `textContent`; links only for http(s) URLs with
  `rel="noopener noreferrer"`.
- Unknown data is `null`, never guessed. Never invent tour dates; sample data uses fictional bands and
  `example.com`/`example.org` URLs.
- Keep `dist/index.html` under 600 kB gzipped at 50 bands / 5,000 shows.
- Never send requests to Nominatim from tests or CI; tests inject a fake fetch.
- The repository is local-only for now; do not add a remote or push.
- Comments only where the code cannot say it; prefer descriptive names.
