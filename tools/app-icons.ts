import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseArguments, runCli, UsageError } from './shared/files.ts';
import { APP_BACKGROUND, APP_ICONS, type AppIcon } from './vite/webApp.ts';
import { pngDimensions } from './vite/socialCard.ts';

const USAGE = `Usage: node tools/app-icons.ts

Renders the icons of the installable app from the globe mark (src/brand/mark.svg) on Stage lights'
slate, like the social card, into src/brand/: ${APP_ICONS.map((icon) => icon.file).join(', ')}.
Run it after changing the mark and commit the files; the build only copies them.`;

const MARK_PATH = 'src/brand/mark.svg';
const OUT_DIR = 'src/brand';
const MARK_VIEWBOX = 64;
/** The middle of the mark's drawing (globe and pin) in its viewBox, measured from mark.svg, so it sits optically centred. */
const MARK_CENTRE = { x: 29, y: 31.25 } as const;
/**
 * The mark's share of the icon's side. Launchers crop maskable icons to as little as the centred circle of 80 %
 * diameter, so the mark's square must fit inside it; iOS rounds the touch icon's corners.
 */
const MARK_SHARE: Readonly<Record<AppIcon['purpose'], number>> = { any: 0.78, maskable: 0.56 };

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), [], []);
  if (args.positional.length > 0) throw new UsageError('app-icons takes no arguments');
  const mark = readFileSync(MARK_PATH, 'utf8');
  for (const icon of APP_ICONS) {
    const png = await sharp(Buffer.from(iconSvg(mark, icon))).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const size = pngDimensions(png);
    if (size === null || size.width !== icon.size || size.height !== icon.size) {
      throw new Error(`rendered ${icon.file} as ${size === null ? 'no PNG' : `${size.width}x${size.height}`}; expected ${icon.size}x${icon.size}`);
    }
    const path = join(OUT_DIR, icon.file);
    writeFileSync(path, png);
    console.log(`Wrote ${path} (${(png.byteLength / 1000).toFixed(1)} kB)`);
  }
  return 0;
});

function iconSvg(markSvg: string, icon: AppIcon): string {
  const mark = markSvg.trim();
  if (!mark.startsWith('<svg ')) throw new Error(`${MARK_PATH} must start with <svg`);
  const markSize = icon.size * MARK_SHARE[icon.purpose];
  const scale = markSize / MARK_VIEWBOX;
  const x = icon.size / 2 - MARK_CENTRE.x * scale;
  const y = icon.size / 2 - MARK_CENTRE.y * scale;
  const placedMark = mark.replace('<svg ', `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${markSize.toFixed(2)}" height="${markSize.toFixed(2)}" color="${APP_BACKGROUND}" `);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" viewBox="0 0 ${icon.size} ${icon.size}">`,
    `  <rect width="${icon.size}" height="${icon.size}" fill="${APP_BACKGROUND}"/>`,
    placedMark.replace(/\n/g, '\n  ').replace(/^/, '  '),
    '</svg>',
    '',
  ].join('\n');
}
