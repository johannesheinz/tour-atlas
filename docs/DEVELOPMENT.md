# Development

How Tour Atlas is built, configured and deployed. For adding or changing band data, see
[CONTRIBUTING.md](../CONTRIBUTING.md) and [DATA_FORMAT.md](DATA_FORMAT.md).

The app is a static site: one `index.html` with every script, style, coastline and tour date inlined, plus
self-hosted `.woff2` fonts and the band logo `.webp` files next to it, and the files that make it an installable
app that works offline. No backend, and no network requests at runtime beyond the site's own files.

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
| `TOUR_ATLAS_CHROMIUM` | `npm run feature-clips` | Path to a Chrome or Chromium executable for the recordings, instead of the one `npx playwright-core install chromium` downloads. |
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
outside the size budget. The same command also writes `docs/brand/logo-light.webp` and `logo-dark.webp`, the
wordmark README.md shows for GitHub's light and dark themes; commit them too.

To look at the build, serve it locally: `npm run preview` (http://localhost:4173). Opening
`dist/index.html` from disk (`file://`) also works as long as the font files stay next to it; a browser
that blocks local fonts falls back to system fonts, and there is no offline copy (service workers need
`http://localhost` or `https:`); nothing else changes.

## Installable app and offline copy

The build also writes what browsers need to install the site and open it without a connection:

- `manifest.webmanifest` (`tools/vite/webApp.ts`): standalone display, relative `start_url` and `scope` so it
  works below any path, the page's description, and the icons. `<head>` links it and `apple-touch-icon.png`,
  which iOS uses instead of the manifest's icons. The icons in `src/brand/` (192, 512, maskable 512, touch
  180) are rendered from the mark by `npm run app-icons` (sharp, run by hand after changing the mark; commit
  them). `theme-color` starts as Stage lights' panel and follows the active style and theme.
- `sw.js` (`src/sw/serviceWorker.ts`, compiled by `tools/vite/serviceWorker.ts` after every other plugin):
  its first line lists every file of the build except `og-card.png` with a hash of their contents, so each
  deploy changes the worker. It precaches them all on install and answers opening the app and those files
  from the cache; everything else goes to the network. The page registers it after load, in production
  builds only.
- Updates (`src/serviceWorkerUpdates.ts`): browsers look for a new `sw.js` when the page opens, and the
  installed app also asks each time it resumes. A newer build installs in the background and waits; the
  page shows a note with Reload (`src/view/updateNotice.ts`) that switches to it.

`check-dist` checks the manifest's fields and the icons' sizes, and that `sw.js` lists exactly the files in
`dist/` with their current hash, so an installed app always learns about a deploy. Fetching and Cache Storage
are allowed in `sw.js` only, and only for the site's own files. The CSP allows `manifest-src 'self'` and
`worker-src 'self'`.

To try it, `npm run preview`, open the page, reload it once the worker has installed (DevTools →
Application → Service workers), then switch DevTools' Network panel to offline and reload again.

`npm run build:budget` builds the same app with a synthetic 50 bands / 5,000 shows dataset and fails above
800 kB transferred (gzipped HTML plus every font file of the heaviest style; browsers download only the
active style's fonts, and the extended Latin files only for letters like ĉ or Č). It is currently about 796 kB.

## Feature clips

```sh
brew install ffmpeg webp                # once (Debian/Ubuntu: sudo apt install ffmpeg webp)
npx playwright-core install chromium    # once, and after updating playwright-core
npm run feature-clips                   # all clips; or: npm run feature-clips -- share mobile
```

Builds the app and records one short looping clip per feature for README.md in headless Chromium, written to
`docs/features/<clip>.webp` as animated WebP (12 fps, at most 600 kB each, loops forever): desktop clips at
1024x640 (the desktop layout starts above 820 px) with a visible cursor, the whole window scaled to 768 px wide
or a region cropped at its own size; phone clips at 390x844 and pixel ratio 2, scaled to 300 px wide, with a
dot for each touch. ffmpeg crops, scales and resamples the screencast into PNG
frames under `.cache/`, and `img2webp` (from libwebp) assembles them, lowering the quality step by step until
a clip fits. Every clip must run 3 to 7 seconds; page reloads (changing the language) are cut out.
`docs/features/` changes only after every requested clip was recorded and encoded; on failure the frames stay
in `.cache/feature-clips-*` for a look.

The clips use the real band data and the app as it is, served under `https://example.org/tour-atlas/` so a
copied link reads like a published one. Re-run after interface changes and commit the new files. Each clip
checks what it shows (the tooltips, the map status naming Stockholm, Sabaton in the search, "Link copied",
the German settings) and stops with an error otherwise. The scenes are in `tools/feature-clips.ts`, the touch
dots in `tools/demo/touch.js`; they share the browser and screencast plumbing with the demo video
(`tools/shared/demoBrowser.ts`).

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

## Phone layout

At 820 px wide and below (`PHONE_LAYOUT_QUERY` in `src/view/layout.ts`) the header, map and timeline fill the window
above the closed bottom sheet and never move; the page itself does not scroll. The sheet is the sidebar
(`src/view/sheet.ts`, snap maths in `src/view/sheetSnap.ts`) and overlays the stage from the bottom.

- Heights: **closed** (the handle with the band count, or the open selection's title), **half** (45% of the window,
  but never over the map controls) and **full** (up to just below the search). The page footer moves to the end of
  the sheet's content.
- Handle: a button with `aria-expanded`. Tap, Enter or Space toggle between closed and half (and close from full);
  the up and down arrow keys step one height and announce it; touch, pen or mouse drag it, and a release snaps to
  the next height in the direction of a fling or else to the nearest one. Focus stays on the handle, which the
  sheet's content follows in tab order; closing moves focus from inside the sheet back to the handle. A release
  that rests before letting go counts as still, so it snaps to the nearest height rather than flinging on.
- Opening a band, place, genre or search result (from the lists, a pin, search) shows it in the sheet at half, so
  its route stays in view above, and announces it. Focus moves only where it did before (into the panel when
  opened from a list). Back to bands, browser Back and Escape close the drill-down and keep the height; with the
  lists showing, Escape closes the sheet.
- Focus after a drill-down closes (all layouts, `src/view/sidebar.ts`, logic in `src/view/drillDownFocus.ts`):
  when focus was in the drill-down, or was lost and no click elsewhere (such as on the map) closed it, it returns
  to the control that opened it: the band, place or genre row (found again by its `data-row-key` when the list
  has redrawn), the search field or the map's keyboard cursor, while it is shown and not inert. Otherwise it goes
  to the sheet's handle on phones, or to the active tab (the preview panel's first control) elsewhere. A selection
  opened from the previews steps back to its preview card first.
- The map frames fits in the part above the resting sheet (`setHiddenBottom`, which the sheet calls as it starts to
  move, with the map frame measured then), and the map's status bar rises with the sheet's top edge, also while it
  is dragged or slides.
- Whenever the sheet comes to rest at half (handle, drag, keys, a pin, a list, search or a URL),
  `MapView.uncoverPins` keeps clear of it the pins the viewer saw before it moved (centres at least
  `uncoverMarginPx` inside the map's visible part then) and the selected pins in the map frame. When any of them is
  within `uncoverMarginPx` of the sheet's top edge or under it, the map pans up just far enough, or zooms out
  (keeping the topmost pin in place) when their spread does not fit; it uses the fit animation, so the flat map
  moves by transforms. A fit since the sheet started moving (opening a band, place, genre or search result) framed
  its shows above the sheet already, so then only the selected pins count, checked once that fit lands. The pure
  geometry is `src/view/uncover.ts`. At full height nothing moves; at closed the view stays as it is (no jump back),
  since closing only uncovers more map and moving it again would undo what the viewer looked at.
- Popovers (`src/view/popover.ts`, placement in `src/view/popoverPlacement.ts`): an open one is fixed to the window
  where its stylesheet puts it, so the stage's scrolling cannot cut it off and it lies over the sheet at every
  height; it flips to the other side of its anchor when it would leave the window and fits there, else shifts, and
  scrolls when the window is shorter than it. It follows page scrolls and resizes while open. The area menu lifts
  the map controls with it (`:has()`), which otherwise stay under the sheet. "Shows around here" opens beside the
  pressed spot, flipping away from the window's edges, so the finger of a long press is never on it. Desktop
  positions are unchanged.
- The timeline sits under the map and is covered at half and full; closing the sheet shows it. Its lanes keep their
  height (`fillsMaxHeight`) and the hidden-lanes note keeps its room, so selections never resize the map. Windows too
  short for the map and the fewest lanes scroll the stage, not the page.
- The height is not in the URL or any storage: a reload starts closed, or at half when the URL selects something.
  Reduced motion snaps without the slide.

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
