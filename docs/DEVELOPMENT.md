# Development

How Tour Atlas is built, configured and deployed. For adding or changing band data, see
[CONTRIBUTING.md](../CONTRIBUTING.md) and [DATA_FORMAT.md](DATA_FORMAT.md).

The app is a static site: one `index.html` with every script, style, coastline and tour date inlined, plus
self-hosted `.woff2` fonts and the band logo `.webp` files next to it. No backend, and no network requests at
runtime.

## Getting started

Requires Node 22.18 or newer; `.nvmrc` pins the major version CI uses (`nvm use`). The CLI tools are TypeScript
run directly by Node.

```sh
npm ci
npm run dev          # http://localhost:5173
npm test
npm run check        # everything CI runs
```

## Environment variables

Nothing is needed to develop, test or build. The variables below are optional, except `NOMINATIM_CONTACT`
for geocoding.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NOMINATIM_CONTACT` | `npm run geocode` | **Required for geocoding.** Email address or project URL sent in the User-Agent, as the Nominatim usage policy demands. |
| `TOUR_ATLAS_BANDS_DIR` | `vite build` | Build from another directory of band files (the size-budget build uses this). Default `data/bands`. |
| `TOUR_ATLAS_OUT_DIR` | `vite build` | Write the build somewhere else. Default `dist`. |
| `TOUR_ATLAS_SITE_URL` | `vite build` | The published address, absolute `https:` and ending in `/` (for example `https://example.org/tour-atlas/`). When set, the build adds the OpenGraph/Twitter card tags and puts `og-card.png` next to `index.html`; anything else set fails the build. Unset (local builds, CI, the budget build) means no card. The deploy workflow sets it from GitHub Pages. |
| `TOUR_ATLAS_CHROMIUM` | `npm run demo-video` | Path to a Chrome or Chromium executable for the recording, instead of the one `npx playwright-core install chromium` downloads. |
| `GITHUB_STEP_SUMMARY` | `validate`, `review` with `--format github` | Set by GitHub Actions; the tools append their Markdown summary to it. |

For local runs, keep them in `.env.local`, which is git-ignored; `npm run geocode` loads it:

```sh
cp .env.example .env.local   # then put your contact address in it
npm run geocode
```

Where to set `NOMINATIM_CONTACT` in GitHub Actions or on a future upload backend is described in
[CONTRIBUTING.md](../CONTRIBUTING.md#geocoding-contact).

## Build

```sh
npm run build
```

Writes `dist/index.html` and the `.woff2` fonts next to it, then checks the output: everything else inlined,
a Content-Security-Policy that blocks all network requests except the page's own fonts, no storage APIs,
and the size budget. The fonts are separate so browsers cache them across data updates.

With `TOUR_ATLAS_SITE_URL` set, the build also writes one social card for the whole site: OpenGraph and
Twitter tags (texts in the `<!-- social-card -->` block in `index.html`, band and show counts filled in at
build time) and `og-card.png`. Link previews never see the hash, so every shared link shows the same card.
The image is `src/brand/og-card.png`, rendered with `src/brand/og-card.svg` by `npm run og-card` (sharp, run
by hand after changing the mark or the card's text; commit both files). Browsers never request it, so it is
outside the size budget.

To look at the build, serve it locally: `npm run preview` (http://localhost:4173). Opening
`dist/index.html` from disk (`file://`) also works as long as the font files stay next to it; a browser
that blocks local fonts falls back to system fonts and nothing else changes.

`npm run build:budget` builds the same app with a synthetic 50 bands / 5,000 shows dataset and fails above
800 kB transferred (gzipped HTML plus every font file of the heaviest style; browsers download only the
active style's fonts, and the extended Latin files only for letters like ĉ or Č). It is currently about 774 kB.

## Demo video

```sh
npx playwright-core install chromium   # once, and after updating playwright-core
npm run demo-video
```

Builds the app, serves `dist/` with Vite's preview server, plays a scripted 50-second tour through it in
headless Chromium (title card, map and timeline, a tour, shows around Stockholm, filters, sharing, the phone
layout, end card) and encodes it with ffmpeg to `docs/demo.mp4` (1920x1080, H.264), plus the poster
`docs/demo-poster.jpg` from the Stockholm scene that README.md links. Frames go to a temporary directory
under `.cache/`, removed after a successful run; on failure the files in `docs/` stay untouched.

It needs ffmpeg on the `PATH` and the Chromium build that the pinned `playwright-core` expects (or
`TOUR_ATLAS_CHROMIUM`, see above). The script, its overlay (cursor, captions, cards) and the phone frame page
are in `tools/demo-video.ts` and `tools/demo/`; the phone page is served by the preview server only and never
reaches `dist/`. The recording uses the real band data, so the video changes with it: commit the new files
after notable data or interface changes. It needs the band Sabaton for the tour scene and shows around
Stockholm for the area scene, and stops with an error otherwise.

## Deploy

`.github/workflows/deploy.yml` validates, builds and publishes `dist/` to GitHub Pages on every push to `main`.
It reads the site address from `actions/configure-pages`, builds with it as `TOUR_ATLAS_SITE_URL` and checks
that the social card is there (`check-dist --require-social-card`).
After the repository is on GitHub, enable it once: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

`.github/workflows/ci.yml` runs on every push and pull request: data validation with inline annotations,
`normalize --check`, a data review summary for pull requests, typecheck, tests, build, a build with a test
`TOUR_ATLAS_SITE_URL` that checks the social card, and the size budget.
Dependabot keeps npm packages and the SHA-pinned GitHub Actions up to date.

## Filtering

Every view is a pure function of the current choices, so the order in which a viewer picks them never matters.
`tests/view/combinedFilter.test.ts` feeds the same choices in different orders and checks the results are equal.

- **Scope:** visible bands (hidden bands, ticked genres, band-view solo) ∩ the area, when one is active. The
  deriver in `src/appState.ts` builds `refsInScope` and `visibleShows` from it; every view reads those: map pins
  and routes, timeline lanes and dots, band list, Places, Genres, drill-downs, the nearby list and the tour.
  Shows outside the area are hidden, not dimmed. `refsByBand` and `showsById` stay unscoped, as the catalogue
  for picked shows and search.
- **Time window on top:** lists, counts, collapsed lanes and the selection panel always apply it; the map
  applies it only with "Follow timeline" on. That is all Follow means.
- **Filter changes:** a chosen preset is recomputed against the scoped shows (`windowAfterFilterChange` in
  `src/view/timePresets.ts`); a custom (zoomed) window is kept. A filter change never rewrites `timePreset`
  and never falls back to "All".
- **Presets stay clickable** when the area has nothing in them; availability comes from `bandShows` (visible
  bands without the area), and the empty state says so in area-aware words.
- **The area survives drill-downs:** opening a band, genre or place, and the map's corner fit button, keep it
  and frame the shows inside it. The area menu is one exclusive choice (Fit to shows, Near me, Around a point,
  a region): picking another entry clears the area.
- **Regions only frame the map.** Their boxes are rough, so filtering by them would silently drop or include
  shows; country filtering lives in the Places tab.
- **"List these shows"** is a live selection (`{ kind: 'nearby' }`) that follows the window and the radius.
  It is never written to the URL.
- **Area-aware texts:** with an area active, empty states, counts and headings name it ("within 50 km of
  Helsinki"). Texts take the whole phrase as a parameter, because "distance + place" does not compose the same
  way in every language.

### The area

- `activeArea()` in `src/appState.ts` gives `{ center, radius }` from one of two sources: the viewer's position
  (Near me) or a picked point. Both filter identically.
- **Near me** positions stay in memory and never reach the URL or a shared link.
- **A picked point** comes from the area menu (radius chip, then a click), a right-click or a one-second long press
  on the map (`src/view/longPress.ts`, 8 px move tolerance), or a place's panel. It is stored as
  `around=<lat>,<lon>&radius=<value><unit>`, rounded to two decimals (about 1 km) the moment it is picked, so
  the app state equals the URL. Parsing is strict: the radius must be one the menu offers.
- **The radius is always chosen** by the viewer; there is no default radius.
- **The label** is the nearest city in the data inside the radius (all bands, ignoring hidden ones, so toggling
  bands does not change it), otherwise the coordinates. It is derived from the URL alone, so a reloaded or
  shared link shows the same label.

## Privacy, technically

- No cookies, no localStorage, sessionStorage or IndexedDB, no analytics, no third-party fonts or scripts;
  the fonts and band logos are served from the same place as the page. Logos are downloaded once by
  `npm run logos`; the page never contacts the original image hosts.
- View state (hidden bands, time window, selection) lives in the URL hash only, so a view can be shared
  as a link. The hash is never sent to a server. `src/share.ts` builds the share link from the app state
  (`currentHash()`), not from the address bar, whose hash is written with a 300 ms delay. Shared links leave
  out the language, time format and distance settings; the "Near me" position is never put in the URL at all.
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
| `data/tags.json` | the fixed tag list (genre, label, other) |
| `samples/` | fictional sample bands used by the tests, one file with invalid rows, one LLM-style draft |
| `.claude/skills/` | Claude Code skills for the tasks that need judgement |
