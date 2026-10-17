---
name: change-schema
description: Change the Tour Atlas band file format (add, rename or retype a field, change a rule) consistently across schema, types, validator, normalize, docs, samples, data and tests. Use for any edit to schema/tour.schema.json or src/data/types.ts.
---

# Change the band file format

The format is a contract with the upstream LLM pipeline and with every file in `data/bands/`. Plan the
change with the user before editing: what the field means, whether it is nullable, and whether old files
stay valid.

## Constraints that do not change

- The schema stays usable as a structured-output schema: every property required, unknown = `null`,
  `additionalProperties: false`, and only the keywords listed in `tests/data/schema.test.ts`
  (no `minimum`, `maxLength`, `format`, `oneOf`, ...). Put range and semantic checks in the validator.
- One validator: `src/data/validate.ts`. No second copy in tools, the app or a future upload path.
- `src/data/` stays free of DOM and Node APIs.

## Checklist, in order

1. `src/data/types.ts`: the interface, the key list (`SHOW_KEYS` etc.) in canonical order, `LIMITS` if needed.
   The `KeyListsAreComplete` type fails to compile if a key list misses a field.
2. `schema/tour.schema.json`: property in the same position as the key list, added to `required`,
   a description written for an LLM reader (what to put in, when to use `null`).
3. `src/data/validate.ts`: parse and check the field; keep messages in the form `<what> <is wrong>; <how to fix>`.
4. `src/data/normalize.ts`: add the field to `orderShowKeys` (and trimming, if it is text).
5. Consumers: `diff.ts` picks up `SHOW_KEYS` automatically; check `lint.ts`, `src/view/detail.ts`,
   `src/view/searchIndex.ts`, `tools/review.ts`, `tools/fixtures/synthetic.ts`.
6. Not backwards compatible (new required non-null field, renamed or removed field, changed meaning):
   bump `SCHEMA_VERSION`, add a migration for old files and run it over `data/bands/` and `samples/`.
   Tell the user the upstream pipeline must change at the same time.
7. Samples: update `samples/*.json` and copy the valid ones to `data/bands/`; add a broken row for each
   new error class to `samples/broken-lanterns.json`.
8. Tests: a case per new error message in `tests/data/validate.test.ts`; `npm test` also re-checks
   schema/validator agreement and key order.
9. Docs: `docs/DATA_FORMAT.md` field table and example.
   If the change touches tags: `data/tags.json`, `src/data/tags.ts`, then `npm run tags` to refresh the schema enum.
10. `npm run check`, then `npm run build:budget`: a new field costs bytes at 5,000 shows.
