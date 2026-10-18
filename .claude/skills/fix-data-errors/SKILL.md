---
name: fix-data-errors
description: Fix Tour Atlas band files that fail validation, geocoding or the data review, by reading the tool output and correcting the data without guessing. Use when npm run validate, normalize --check, geocode or the CI "Tour data" job reports errors or warnings.
---

# Fix data errors

The tools say exactly what is wrong; deciding what is right sometimes needs the source page or the user.

## Read the output

Every message is `<file> <path>: <problem>`, e.g. `data/bands/glass-harbor.json shows[12].date: "17 Oct" is not YYYY-MM-DD`.
`shows[12]` is the 13th row in the file as it is now (before normalizing). In CI the same text appears as an
annotation on the offending line.

## Errors

| Message | Fix |
| --- | --- |
| `is not YYYY-MM-DD` / `is not a real calendar date` | Re-read the source for the date. If the year is not printed, ask the user. |
| `is before date` / `days after date` (endDate) | `endDate` is only for multi-day events with an unannounced day; otherwise `null`. |
| `is not HH:MM (24-hour clock)` | Convert "8pm" to `20:00`; if only "doors" is given, ask whether to use it or `null`. |
| `is not an ISO 3166-1 alpha-2 country code` | Use the two-letter code (`GB`, not `UK`). |
| `has no Latin letters or digits` (city) | Use the Latin-script name of the city. |
| `is empty (use null when unknown)` | Replace `""` with `null`. |
| `missing (use null when unknown)` / `unknown field` | Every field must be present; extra fields are not allowed. Do not stash data in `notes` to keep an unknown field. |
| `is not an http(s) URL` | Use the real `https://` link or `null`. Never keep `javascript:` or similar. |
| `duplicate id` | Two rows claim the same show. Check whether it is a real second show (then clear its `id` to `null` and normalize, which assigns `-2`) or a duplicate (then remove one). |
| `missing; run "npm run normalize"` (id) | Run `npm run normalize`. |
| `missing coordinates; run "npm run geocode"` | Run the geocoder (needs `NOMINATIM_CONTACT`). |
| `is not in data/tags.json` | Use an existing tag id, or add the tag to `data/tags.json` and run `npm run tags`. |
| `is listed twice` (tag) | Remove the duplicate. |
| `file name must be ...` | Rename the file to `<band.id>.json`; never change `band.id` to match a file name. |
| `is not normalized` | Run `npm run normalize` and commit the result. |

## Unresolved geocodes

The geocoder lists rows it could not place. Find the venue or city on OpenStreetMap, then set
`"geo": { "lat": <5 decimals>, "lon": <5 decimals>, "precision": "venue" | "city", "source": "manual" }`.
Use `city` precision unless you are sure of the building. Mention manual points in the pull request.

## Geocoded to the wrong place

Nominatim answers with the first match in the country, which can be a namesake. Warnings do not catch
this when both places are in the same country; it shows on the map, or as a wrong nearest-city label.

- The geocoder already rejects venue answers more than 50 km from the city centre (`venue result … km
  away ignored`). Check that the city centre itself is right.
- **The city has namesakes in the country:** set `region` on those rows, set their `geo` to `null` and run
  `npm run geocode` again. The region is part of the cache key, so it queries afresh.
- **A wrong answer is cached:** correct or delete the entry in `tools/geocache.json`, otherwise the next run
  repeats it. Explain the change in the commit.
- **No query finds the right place:** set the coordinates by hand (`"source": "manual"`), as above.

## Warnings (do not block, always check)

| Warning | Usual cause |
| --- | --- |
| `coordinates fall inside XX, but countryCode is YY` | The geocoder found a namesake in another country, or the country code is wrong. Fix whichever is wrong. |
| `same day as shows[n] ... km away` | A date typo, or two bands' tours mixed up. Check the source. |
| `looks like a duplicate` | The same show listed twice; if it is a matinee and an evening show, set both `startTime`s. |
| `is N days old` (retrievedAt) | Refresh the band with the `band-data` skill. |
| `more than three years ahead` | Usually a year typo. |

A warning that is correct as is (a real double show in two cities, say) stays; explain it in the pull request.
