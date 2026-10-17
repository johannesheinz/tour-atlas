---
name: band-logo
description: Find a Tour Atlas band's logo image and set band.logoUrl, checking each candidate as the silhouette the app will show. Use when asked to add, find, fix or replace a band logo, or when npm run logos / the Logos workflow reports a failed or unusable logo.
---

# Find a band logo

Deciding whether an image really is the band's logo, and whether it still reads as a one-colour
silhouette, takes judgement. Downloading, converting and storing it is `npm run logos`.

## What counts

- The band's wordmark or emblem as the band itself uses it: website header, album covers, merch.
- Not: band photos, album or single artwork, one-off tour logos that differ from the band logo,
  fan-made graphics, logos with a slogan, URL or album title baked in.
- Solo artists and composers often have no logo. `null` is a fine answer; don't use a portrait.

## Where to look, in order

1. The band's official website: the header logo file (`<img>` or `<svg>`), the press kit / EPK /
   media download page, the favicon set only if it is the full logo.
2. Wikimedia Commons: `File:<Band> logo.svg` / `.png`. Use the original file on
   `upload.wikimedia.org`, not the `File:` page or a `/thumb/` rendering.
3. The logo in the band's Wikipedia infobox (often on `upload.wikimedia.org/wikipedia/en/...`).
4. Label or festival press pages, only if the image is clearly the official logo.

Avoid CDNs that need cookies or block hotlinking; the download must work from CI.

## Format preference

1. SVG
2. PNG with a transparent background
3. Any other PNG, WebP or JPEG, only when nothing better exists. The tool keys out the background
   colour, which fails on photos, gradients and logos with a frame around them.

## Check every candidate

```sh
npm run logo:preview -- <band-id> '<image-url>'
```

It prints the format, size and whether the background is transparent, and writes
`.cache/logo-previews/<band-id>.orig.png` (as downloaded) and `<band-id>.png` (the silhouette the app
will show, black on the app's paper colour). Open both. Accept the image only if:

- it is this band's logo,
- the silhouette is legible: letters separated, no solid block where a coloured shape was,
- nothing else (text, frame, background art) dominates.

Grey shading in the silhouette (from gradients, outlines or glows in the logo) is kept on purpose.
Don't reject a candidate for it, and don't make the converter flatten it; only legibility counts.

If the silhouette is a blob, look for another file: a transparent PNG or SVG of the same logo usually fixes it.

## Store it

1. Put the URL in `band.logoUrl` of `data/bands/<band-id>.json` (the image file itself).
2. `npm run logos` downloads and converts it to `data/logos/<band-id>.webp`. Existing files are kept;
   to replace one, use `node tools/logos.ts data/bands/<band-id>.json --force`.
3. `npm run validate`, then open a pull request. On GitHub the Logos workflow does step 2 for you.

Report per band: the URL, the format, where you found it, and anything you were unsure about.
