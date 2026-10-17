---
name: band-data
description: Create or refresh a Tour Atlas band file from a band's tour page or pasted tour dates. Use when asked to add a band, update or refresh a band's dates, or turn a tour announcement into data/bands/<band-id>.json.
---

# Create or refresh a band file

Reading a tour page is the one step that needs judgement. Everything after it is deterministic tooling.
Read `docs/DATA_FORMAT.md` before writing anything.

## 1. Read the source

- Fetch the page the user names (or use the text they pasted). Prefer the band's own tour page over ticket
  shops or aggregators.
- Note the URL for `source.url` and today's date for `source.retrievedAt`.
- If the page does not list dates (JavaScript-only widget, login wall), stop and tell the user; never fill
  gaps from memory or other bands' pages.

## 2. Extract, never guess

Write each show as a draft row: `id: null`, `geo: null`, every other field present.

- `date`: local date of the show as printed. A year missing from the page is a reason to ask, not to assume.
- Festival with a date range and no announced day: `date` = first day, `endDate` = last day,
  `eventName` = festival name, `venue` = the site if named, else `null`.
- `startTime` only when printed (doors are not the start time unless the page says so).
- `status`: map "sold out" → `soldout`, "cancelled" → `cancelled`, "postponed"/"moved" → `postponed`;
  anything else or nothing → `null` (not `scheduled` unless the page lists the show as on sale or confirmed).
- `city` in Latin script; `region` only when it disambiguates (`Portland, OR`); `countryCode` ISO alpha-2.
- `tourName` only when the page names the tour.
- `notes`: one short factual line from the page, e.g. "Moved from Kulturhaus", otherwise `null`.
- `band.tags`: only ids from `data/tags.json`. Genre tags are fine when the band's own site or a
  well-established reference (its Wikipedia article) says so; otherwise `[]`. There are no location tags:
  where a band plays comes from its shows.
  If a fitting tag is missing, propose it to the user instead of using an unknown id.
- Unknown = `null`. Never invent venues, times or ticket links.

## 3. Refreshing an existing band

Load `data/bands/<band-id>.json` first.

- Keep every past show exactly as it is.
- Keep show ids: match rows by date + city and copy the existing `id` and `geo`.
- A future show that is no longer on the page is not deleted silently. Keep it and list it for the user
  (it may be cancelled, moved or simply missing from the page); let them decide.
- Changes to `band.name`, `band.color` or `band.tags` need the user's confirmation; keep curated tags.

## 4. Hand over to the tools

```sh
node tools/validate.ts data/bands/<band-id>.json --draft
NOMINATIM_CONTACT="<the user's contact>" npm run geocode     # ask the user for the contact; never use one you invent
npm run normalize
npm run validate
npm run review -- --base origin/main
```

Report: shows added, changed and removed (from `review`), any unresolved geocodes, every warning, and
every assumption you had to make. Draft the pull request description from the template in
`.github/pull_request_template.md`.
