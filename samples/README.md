# Samples

All bands, venues and dates here are fictional; URLs use the reserved `example.com` / `example.org` domains.

| File | Purpose |
| --- | --- |
| `glass-harbor.json` | European tour with past and future dates, sold-out, cancelled and postponed shows, a festival without an announced day (`endDate`) |
| `velvet-meridian.json` | Pacific tour across the antimeridian (Tokyo to Anchorage), two nights in one venue |
| `iron-lantern.json` | Latin and North America with diacritics (São Paulo, Bogotá, Montréal), an explicit `band.color`, two tours |
| `northbound-static.json` | Single-city residency with a matinee and an evening show on the same day; tests the zoom clamp |
| `broken-lanterns.json` | One valid row and one row for each error class; invalid in every mode |
| `draft/ashen-choir.json` | Upstream-style draft: `id` and `geo` are `null`. Valid with `--draft` only; run the geocoder to complete it |

Tests use these files; the published data in `data/bands/` is real and separate.
