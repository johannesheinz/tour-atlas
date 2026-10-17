## What changes

<!-- Which bands are added or updated, and where the dates come from. -->

## Checklist

- [ ] Every show is on the page in `source.url` (or the show's `sourceUrl`); nothing is guessed, unknown values are `null`
- [ ] `source.retrievedAt` is the day the page was read
- [ ] `npm run geocode` filled the coordinates; any `"source": "manual"` point is explained below
- [ ] `npm run normalize` and `npm run validate` pass locally
- [ ] Past shows are kept; future shows that vanished from the source are explained below, not silently deleted
- [ ] I read the "Tour data review" summary that CI adds to this pull request

## Notes for the reviewer

<!-- Manual coordinates, removed shows, anything the warnings flag that is actually correct. -->
