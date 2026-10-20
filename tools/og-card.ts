import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { loadWoffFont, type OutlineFont } from './shared/fontOutlines.ts';
import { parseArguments, runCli, UsageError } from './shared/files.ts';
import { MAX_SOCIAL_CARD_KB, SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH, pngDimensions } from './vite/socialCard.ts';

const USAGE = `Usage: node tools/og-card.ts

Builds src/brand/og-card.svg from the globe mark (src/brand/mark.svg) and the wordmark and
tagline, outlined from the Fontsource font files, and renders it to src/brand/og-card.png
(${SOCIAL_CARD_WIDTH}x${SOCIAL_CARD_HEIGHT}), the image every shared link shows. It also renders the mark and
wordmark on a transparent background to docs/brand/logo-light.webp and logo-dark.webp for the README.
Run it after changing the mark or the card's text and commit all files; the build only copies the PNG.`;

const MARK_PATH = 'src/brand/mark.svg';
const SVG_PATH = 'src/brand/og-card.svg';
const PNG_PATH = 'src/brand/og-card.png';

/** Stage lights, the default style: slate ink as the card, the mark's paper for the globe and the name. */
const COLOURS = { card: '#1f2a35', paper: '#e3e4df', tagline: '#a6b0ba' } as const;
/** Set like the app's wordmark in Stage lights: "Tour" heavy and "Atlas" light, with no space between them. */
const WORDMARK = {
  parts: [
    { text: 'Tour', font: '@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff' },
    { text: 'Atlas', font: '@fontsource/inter-tight/files/inter-tight-latin-300-normal.woff' },
  ],
  size: 132,
  letterSpacingEm: 0,
} as const;
const TAGLINE = { lines: ['Follow your favourite bands', 'on tour through space and time.'], font: '@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff', size: 40, lineHeight: 54 } as const;
const MARK_BOX = { x: 64, y: 114, size: 400 } as const;
const TEXT_X = 500;
const WORDMARK_BASELINE = 322;
const TAGLINE_FIRST_BASELINE = 408;
const RIGHT_MARGIN = 64;

/**
 * The README logo, one per GitHub theme. The globe's paper takes the page's background, as the app's mark takes its
 * style's stock, so only the ink details show; the ink is Stage lights' ink for that theme.
 */
const README_LOGOS = [
  { path: 'docs/brand/logo-light.webp', paper: '#ffffff', ink: '#1f2a35' },
  { path: 'docs/brand/logo-dark.webp', paper: '#0d1117', ink: '#d6dee6' },
] as const;
const LOGO = { height: 160, markSize: 160, gap: 30, wordmarkSize: 132, baseline: 128 } as const;

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), [], []);
  if (args.positional.length > 0) throw new UsageError('og-card takes no arguments');

  const require = createRequire(import.meta.url);
  const font = (specifier: string): OutlineFont => loadWoffFont(readFileSync(require.resolve(specifier)));
  const wordmarkParts = WORDMARK.parts.map((part) => ({ text: part.text, font: font(part.font) }));
  const svg = cardSvg(readFileSync(MARK_PATH, 'utf8'), wordmarkParts, font(TAGLINE.font));
  writeFileSync(SVG_PATH, svg);

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const size = pngDimensions(png);
  if (size === null || size.width !== SOCIAL_CARD_WIDTH || size.height !== SOCIAL_CARD_HEIGHT) {
    throw new Error(`rendered ${size === null ? 'no PNG' : `${size.width}x${size.height}`}; expected ${SOCIAL_CARD_WIDTH}x${SOCIAL_CARD_HEIGHT}`);
  }
  const kb = png.byteLength / 1000;
  if (kb > MAX_SOCIAL_CARD_KB) throw new Error(`the card is ${kb.toFixed(1)} kB; it must stay under ${MAX_SOCIAL_CARD_KB} kB`);
  writeFileSync(PNG_PATH, png);
  console.log(`Wrote ${SVG_PATH} and ${PNG_PATH} (${kb.toFixed(1)} kB)`);

  for (const logo of README_LOGOS) {
    const webp = await sharp(Buffer.from(logoSvg(readFileSync(MARK_PATH, 'utf8'), wordmarkParts, logo.paper, logo.ink)))
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    writeFileSync(logo.path, webp);
    console.log(`Wrote ${logo.path} (${(webp.byteLength / 1000).toFixed(1)} kB)`);
  }
  return 0;
});

function logoSvg(markSvg: string, wordmarkParts: readonly WordmarkPart[], paper: string, ink: string): string {
  const mark = markSvg.trim();
  if (!mark.startsWith('<svg ')) throw new Error(`${MARK_PATH} must start with <svg`);
  const recoloured = mark.replaceAll('fill="#e3e4df"', `fill="${paper}"`).replaceAll('stroke="#e3e4df"', `stroke="${paper}"`);
  if (recoloured.includes('#e3e4df')) throw new Error(`${MARK_PATH} uses its paper colour somewhere the logo does not recolour`);
  const placedMark = recoloured.replace('<svg ', `<svg x="0" y="${(LOGO.height - LOGO.markSize) / 2}" width="${LOGO.markSize}" height="${LOGO.markSize}" color="${ink}" `);
  let penX = LOGO.markSize + LOGO.gap;
  const paths = wordmarkParts.map((part) => {
    const outline = part.font.textPath(part.text, LOGO.wordmarkSize, 0);
    const path = `  <path transform="translate(${penX} ${LOGO.baseline})" fill="${ink}" d="${outline.d}"/>`;
    penX += outline.width;
    return path;
  });
  const width = Math.ceil(penX);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LOGO.height}" viewBox="0 0 ${width} ${LOGO.height}">`,
    placedMark.replace(/\n/g, '\n  ').replace(/^/, '  '),
    ...paths,
    '</svg>',
    '',
  ].join('\n');
}

interface WordmarkPart {
  readonly text: string;
  readonly font: OutlineFont;
}

function cardSvg(markSvg: string, wordmarkParts: readonly WordmarkPart[], taglineFont: OutlineFont): string {
  const mark = markSvg.trim();
  if (!mark.startsWith('<svg ')) throw new Error(`${MARK_PATH} must start with <svg`);
  const placedMark = mark.replace('<svg ', `<svg x="${MARK_BOX.x}" y="${MARK_BOX.y}" width="${MARK_BOX.size}" height="${MARK_BOX.size}" color="${COLOURS.card}" `);

  const available = SOCIAL_CARD_WIDTH - RIGHT_MARGIN - TEXT_X;
  const placeRun = (parts: readonly WordmarkPart[], size: number, letterSpacingEm: number, baseline: number, fill: string) => {
    let penX = 0;
    const paths = parts.map((part, index) => {
      const outline = part.font.textPath(part.text, size, letterSpacingEm);
      const path = `  <path transform="translate(${TEXT_X + penX} ${baseline})" fill="${fill}" d="${outline.d}"/>`;
      penX += outline.width + (index < parts.length - 1 ? letterSpacingEm * size : 0);
      return path;
    });
    const text = parts.map((part) => part.text).join('');
    if (penX > available) throw new Error(`"${text}" is ${Math.ceil(penX)} px wide; the card has room for ${available} px`);
    return paths;
  };
  const wordmark = placeRun(wordmarkParts, WORDMARK.size, WORDMARK.letterSpacingEm, WORDMARK_BASELINE, COLOURS.paper);
  const tagline = TAGLINE.lines.flatMap((line, index) =>
    placeRun([{ text: line, font: taglineFont }], TAGLINE.size, 0, TAGLINE_FIRST_BASELINE + index * TAGLINE.lineHeight, COLOURS.tagline),
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_WIDTH}" height="${SOCIAL_CARD_HEIGHT}" viewBox="0 0 ${SOCIAL_CARD_WIDTH} ${SOCIAL_CARD_HEIGHT}">`,
    `  <!-- Generated by npm run og-card from ${MARK_PATH}; text outlined from Inter Tight (SIL Open Font License). -->`,
    `  <rect width="${SOCIAL_CARD_WIDTH}" height="${SOCIAL_CARD_HEIGHT}" fill="${COLOURS.card}"/>`,
    placedMark.replace(/\n/g, '\n  ').replace(/^/, '  '),
    ...wordmark,
    ...tagline,
    '</svg>',
    '',
  ].join('\n');
}
