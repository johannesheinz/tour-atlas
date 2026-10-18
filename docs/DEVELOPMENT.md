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

## Privacy, technically

- No cookies, no localStorage, sessionStorage or IndexedDB, no analytics, no third-party fonts or scripts;
  the fonts and band logos are served from the same place as the page. Logos are downloaded once by
  `npm run logos`; the page never contacts the original image hosts.
- View state (hidden bands, time window, selection) lives in the URL hash only, so a view can be shared
  as a link. The hash is never sent to a server. Shared links leave out the language, time format and
  distance settings; the "Near me" position is never put in the URL at all.
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
