# Tour Atlas

Concert tour dates of many bands on one world map, with a zoomable timeline aligned underneath.
A static site: one `index.html` with every script, style, coastline and tour date inlined, plus three
self-hosted font files next to it. No backend, no network requests to third parties, no cookies.

- Equal Earth map with automatic fitting (antimeridian-aware), zoom and pan, great-circle routes, merged and
  clustered pins, greyed past shows, hollow cancelled shows; canvas rendering above 2,000 shows
- Timeline with one lane per band, x-axis zoom, adaptive ticks, a today marker and virtualised lanes
- Hover links map and timeline; click lists the shows in a detail panel; the map can follow the timeline window
- Search across bands, cities, venues, tours and festivals; band list with filter, sort, solo, show/hide all
- Local preview: drop band files to validate them, see the diff against the published data and download the
  normalized file. Nothing leaves the browser.
- Light and dark themes that follow the system, with a toggle; keyboard navigation with visible focus

Tour data lives in [`data/bands/`](data/bands/), one JSON file per band, and is changed through pull requests.
See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md).

## Develop

Requires Node 22.18 or newer (CI uses the version in `.nvmrc`). The CLI tools are TypeScript run directly by Node.

```sh
npm ci
npm run dev          # http://localhost:5173
npm test
npm run check        # everything CI runs
```

## Build

```sh
npm run build
```

Writes `dist/index.html` and the `.woff2` fonts next to it, then checks the output: everything else inlined,
a Content-Security-Policy that blocks all network requests except the page's own fonts, no storage APIs,
and the size budget. The fonts are separate so browsers cache them across data updates.

To look at the build, serve it locally: `npm run preview` (http://localhost:4173). Opening
`dist/index.html` from disk (`file://`) also works as long as the font files stay next to it; a browser
that blocks local fonts falls back to system fonts and nothing else changes.

`npm run build:budget` builds the same app with a synthetic 50 bands / 5,000 shows dataset and fails above
600 kB transferred (gzipped HTML plus fonts). It is currently about 510 kB.

## Deploy

`.github/workflows/deploy.yml` validates, builds and publishes `dist/` to GitHub Pages on every push to `main`.
After the repository is on GitHub, enable it once: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

`.github/workflows/ci.yml` runs on every push and pull request: data validation with inline annotations,
`normalize --check`, a data review summary for pull requests, typecheck, tests, build and the size budget.
Dependabot keeps npm packages and the SHA-pinned GitHub Actions up to date.

## Privacy

- No cookies, no localStorage, sessionStorage or IndexedDB, no analytics, no third-party fonts or scripts;
  the fonts are served from the same place as the page.
- View state (hidden bands, time window, selection) lives in the URL hash only, so a view can be shared
  as a link. The hash is never sent to a server.
- Previewed files are read in the browser and kept in memory until the tab closes.
- The Content-Security-Policy sets `connect-src 'none'`, so the page cannot make requests even by mistake.
  Ticket and source links open in a new tab without a referrer.
- GitHub Pages, as the host, logs visitor IP addresses; that is outside this app. Because the app is a
  single file, it can be hosted anywhere else, or opened from disk.

## Layout

| Path | What |
| --- | --- |
| `data/bands/` | published band files |
| `schema/tour.schema.json` | JSON Schema, also usable as an LLM structured-output schema |
| `src/data/` | validator, ids, normalize, diff, lint, palette: shared by app, tools and build |
| `src/store/` | `DataStore` interface and `StaticStore` for the bundled data |
| `src/view/` | map, timeline, band list, detail, preview panel, search |
| `tools/` | `validate`, `normalize`, `geocode`, `review`, build checks and Vite plugins |
| `samples/` | fictional sample bands, one file with invalid rows, one LLM-style draft |
| `.claude/skills/` | Claude Code skills for the tasks that need judgement |

## Credits

Projection: Equal Earth (Šavrič, Patterson, Jenny). Coastlines and borders: Natural Earth via
[world-atlas](https://github.com/topojson/world-atlas). Geocoding: Nominatim, © OpenStreetMap contributors
(ODbL). Fonts: League Gothic and Archivo (SIL Open Font License), self-hosted via Fontsource.
All bands in `samples/` and `data/bands/` are fictional.
