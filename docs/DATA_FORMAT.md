# Band file format

One JSON file per band in `data/bands/<band-id>.json`. The contract is
[`schema/tour.schema.json`](../schema/tour.schema.json) (JSON Schema 2020-12) plus the semantic rules
below, all enforced by `tools/validate.ts`, which runs the same code as the app.

The schema is written so it can be handed to an LLM as a structured-output schema as is
(OpenAI strict mode, Anthropic structured outputs):

- every field is required and present; unknown values are `null`, never guessed
- no extra fields (`additionalProperties: false` everywhere)
- only `type`, `enum`, `pattern`, `required`, `properties`, `items`, `anyOf`, `$ref`/`$defs` and
  descriptions are used; ranges, real calendar dates and the country list are checked by the validator

If a provider rejects the `$schema` keyword, remove that one line before sending.

## Two stages

| Stage | Who writes it | `show.id` | `show.geo` | Check with |
| --- | --- | --- | --- | --- |
| Draft | upstream pipeline (LLM) or a person | `null` | `null` | `node tools/validate.ts <file> --draft` |
| Repository | after `npm run geocode` and `npm run normalize` | filled | filled | `npm run validate` |

Files in `data/bands/` must be in the repository stage. The build fails otherwise.

## Fields

### File

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | integer | always `1` |
| `band` | object | see below |
| `source` | object | see below |
| `shows` | list | all shows of the band, past and future; at most 2,000 per file |

### `band`

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | lowercase ASCII slug, words joined by `-`, e.g. `glass-harbor`. Must equal the file name. Never changes. |
| `name` | string | as the band writes it, up to 120 characters |
| `color` | string or null | lowercase hex like `#3a7bd5`; `null` lets the app pick from its palette |
| `tags` | list of strings | tag ids from [`data/tags.json`](../data/tags.json), at most 12, no duplicates; `[]` when none applies. Never invent a tag. |

### `source`

| Field | Type | Rule |
| --- | --- | --- |
| `url` | string | the page the dates were taken from, `http(s)://` |
| `retrievedAt` | string | `YYYY-MM-DD`, the day the page was read. CI warns when it is older than 90 days. |

### `shows[]`

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string or null | `<band.id>-<date>-<city slug>`, e.g. `iron-lantern-2026-10-13-sao-paulo`. A second show in the same city on the same day gets `-2`. Leave `null` in drafts; `npm run normalize` generates it. Once generated it stays, even if the show moves. |
| `date` | string | `YYYY-MM-DD`, local date of the show. For a multi-day event where the band's day is not announced, the first day. |
| `endDate` | string or null | only for that case: the event's last day, at most 14 days after `date`. Otherwise `null`. |
| `startTime` | string or null | local start time, 24-hour `HH:MM` |
| `tourName` | string or null | e.g. `Hollow Tides Tour`; `null` for one-off shows |
| `eventName` | string or null | festival or event name, e.g. `Fjordstorm Festival` |
| `venue` | string or null | venue name; `null` if not announced |
| `city` | string | Latin-script city name (`São Paulo`, `Tokyo`, not `東京`) |
| `region` | string or null | state or province when it disambiguates the city (`OR` for Portland, Oregon) |
| `countryCode` | string | ISO 3166-1 alpha-2, uppercase (`BR`); `XK` is accepted for Kosovo |
| `status` | string or null | `scheduled`, `cancelled`, `postponed` or `soldout` as stated by the source; `null` if the source says nothing |
| `ticketUrl` | string or null | ticket page for this show |
| `sourceUrl` | string or null | page listing this show if it differs from `source.url` |
| `notes` | string or null | short factual note from the source, up to 500 characters |
| `geo` | object or null | filled by `tools/geocode.ts`; see below |

### `geo`

| Field | Type | Rule |
| --- | --- | --- |
| `lat` | number | −90 to 90, five decimals |
| `lon` | number | −180 to 180, five decimals |
| `precision` | string | `venue` (the building) or `city` (city centre) |
| `source` | string | `nominatim` (geocoded) or `manual` (set by hand; explain in the pull request) |

## Tags

`data/tags.json` is the fixed tag list. Each tag has an `id` (slug), a `label` and a `group`
(`genre`, `region`, `label` or `other`). The app shows them as filter chips: any selected tag within a group
matches, and every group with a selection must match.

- `npm run tags` copies the tag ids into the `band.tags` enum of the schema, so the upstream LLM can only
  answer with known tags. CI fails when the two differ.
- A new tag goes into `data/tags.json` in the same pull request as the first band that uses it.
- `region` describes where the band comes from, not where it tours.

## Rules beyond the schema

- Dates are real calendar dates between 1950 and 2100; `endDate` is not before `date`.
- URLs are `http://` or `https://` without spaces. Anything else (`javascript:` and the like) is rejected.
- Text fields are not empty (use `null`), stay within their length limit and contain no control or
  text-direction override characters.
- Show ids are unique within the file and start with the band id; band ids are unique across `data/bands/`.
- Past shows stay in the file. They are the band's history and the app shows them greyed out.

## Canonical form

`npm run normalize` writes every file the same way, and CI fails when a file differs from it:
keys in schema order, shows sorted by `date` then `id`, text trimmed, 2-space indent, trailing newline.

## Plausibility warnings

`npm run validate` and the pull request review also print warnings that never block a merge:

- coordinates fall inside a different country than `countryCode`
- two shows on the same day more than 100 km apart
- a show that looks like a duplicate (same day, city and venue, no differing start times)
- `source.retrievedAt` older than 90 days, or in the future
- a date more than three years ahead

## Example

```json
{
  "schemaVersion": 1,
  "band": { "id": "iron-lantern", "name": "Iron Lantern", "color": "#c0392b", "tags": ["stoner-rock", "latin-america"] },
  "source": { "url": "https://example.com/iron-lantern/tour", "retrievedAt": "2026-10-15" },
  "shows": [
    {
      "id": "iron-lantern-2026-10-17-belo-horizonte",
      "date": "2026-10-17",
      "endDate": null,
      "startTime": "21:00",
      "tourName": "Embers of the South",
      "eventName": null,
      "venue": "Mister Rock",
      "city": "Belo Horizonte",
      "region": "MG",
      "countryCode": "BR",
      "status": "scheduled",
      "ticketUrl": "https://tickets.example.org/iron-lantern/2026-10-17",
      "sourceUrl": "https://example.com/iron-lantern/tour",
      "notes": null,
      "geo": { "lat": -19.9167, "lon": -43.9345, "precision": "city", "source": "manual" }
    }
  ]
}
```

A draft of the same show from the pipeline has `"id": null` and `"geo": null`; everything else is the same.

## Changing the format

Change the schema, `src/data/types.ts`, the validator, this document and the tests together, and bump
`schemaVersion` for anything that is not backwards compatible. `.claude/skills/change-schema` has the checklist.
