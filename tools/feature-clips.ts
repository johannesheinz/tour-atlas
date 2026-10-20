import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Locator, type Page } from 'playwright-core';
import {
  boxOf,
  calibratePlace,
  CHROMIUM_VARIABLE,
  chooseMapArea,
  chromiumExecutable,
  createDirector,
  publish,
  radiusChip,
  requireCommand,
  requireDist,
  requireFfmpeg,
  requireSearchResult,
  runCommand,
  startPreview,
  startScreencast,
  waitForMapToSettle,
  waitForUrl,
  type Director,
  type Recording,
} from './shared/demoBrowser.ts';
import { concatList, type ScreenPoint } from './shared/screenRecording.ts';
import {
  CLIP_BUDGET_BYTES,
  checkClipDuration,
  cropScaleFilter,
  gridAround,
  img2webpArguments,
  nextQuality,
  outputSize,
  pngFrameArguments,
  pointsAlong,
  spliceSpans,
  WEBP_QUALITIES,
  type Region,
  type Size,
  type Span,
} from './shared/featureClips.ts';
import { parseArguments, runCli, UsageError } from './shared/files.ts';

const USAGE = `Usage: node tools/feature-clips.ts [clip...]   (or: npm run feature-clips, which builds first)

Records one short looping clip per feature of the built app in dist/ with headless Chromium, and writes them
as animated WebP to docs/features/<clip>.webp for README.md. Without arguments it records every clip:
{clips}
They use the real band data, so they change with it; re-run after notable data or interface changes.

Needs a build (dist/index.html), ffmpeg and img2webp on the PATH, and a Chromium for playwright-core:
  brew install ffmpeg webp   (Debian/Ubuntu: sudo apt install ffmpeg webp)
  npx playwright-core install chromium
or ${CHROMIUM_VARIABLE}=<path to a Chrome or Chromium executable>.
Frames go to a temporary directory under .cache/, removed after a successful run; docs/features/ changes only
when every requested clip was recorded and encoded.`;

const OUTPUT_DIR = 'docs/features';
const CURSOR_SCRIPT_PATH = 'tools/demo/overlay.js';
const TOUCH_SCRIPT_PATH = 'tools/demo/touch.js';
/** The address the clips show, so a copied link reads like a published one; every request is answered from dist/. */
const SITE_URL = 'https://example.org/tour-atlas/';

type DeviceName = 'desktop' | 'phone';

interface Device {
  readonly viewport: Size;
  readonly deviceScaleFactor: number;
  readonly touch: boolean;
  readonly overlayScript: string;
}

const DEVICES: Readonly<Record<DeviceName, Device>> = {
  desktop: { viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1, touch: false, overlayScript: CURSOR_SCRIPT_PATH },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, touch: true, overlayScript: TOUCH_SCRIPT_PATH },
};

const WHOLE_DESKTOP: Region = { x: 0, y: 0, ...DEVICES.desktop.viewport };
/** The whole desktop window at three quarters, so its text stays readable. */
const WHOLE_DESKTOP_WIDTH = 768;
/** Cropped desktop regions keep their pixels one to one. */
const NATIVE = 'native';
const PHONE_WIDTH = 300;
const WHOLE_PHONE: Region = { x: 0, y: 0, ...DEVICES.phone.viewport };

const LANE_BAND = 'Amorphis';
const TOUR_BAND = 'Sabaton';
const GENRE = { id: 'power-metal', label: 'Power metal' } as const;
const PICK_AREA = 'Europe';
const PICKED_PLACE = { name: 'Stockholm', geo: { lat: 59.33, lon: 18.07 } } as const;
const AROUND_RADIUS_LABEL = '250';

/** The few browser globals the scripts read in the page; the node project has no DOM types. */
interface PageScope {
  readonly document: {
    readonly fonts: { readonly ready: Promise<unknown> };
    querySelector(selector: string): { readonly textContent: string | null } | null;
  };
  readonly navigator: { readonly clipboard: { readText(): Promise<string> } };
}

interface Touch {
  tap(point: ScreenPoint): Promise<void>;
  tapOn(locator: Locator): Promise<void>;
  press(point: ScreenPoint, ms: number): Promise<void>;
  drag(from: ScreenPoint, to: ScreenPoint, ms: number): Promise<void>;
}

interface Scene {
  readonly page: Page;
  readonly director: Director;
  readonly touch: Touch;
  /** Runs `action` with the camera off: it does not appear in the clip, which continues seamlessly after it. */
  offCamera(action: () => Promise<void>): Promise<void>;
}

interface Clip {
  readonly name: string;
  readonly device: DeviceName;
  readonly crop: Region;
  /** The clip's width in pixels, or NATIVE for the crop's own width. */
  readonly outputWidth: number | typeof NATIVE;
  /** The URL hash the clip opens with. */
  readonly startHash: string;
  /** Everything the clip needs before the camera rolls: data checks, calibration, the starting state. */
  prepare(page: Page): Promise<ClipSetup>;
  play(scene: Scene, setup: ClipSetup): Promise<void>;
}

interface ClipSetup {
  /** Where the visible mouse cursor starts on desktop; phones show touches instead, so null. */
  readonly cursorStart: ScreenPoint | null;
  readonly targets: readonly ScreenPoint[];
}

interface EncodedClip {
  readonly name: string;
  readonly device: DeviceName;
  readonly file: string;
  readonly duration: number;
  readonly size: Size;
  readonly quality: number;
}

const CLIPS: readonly Clip[] = [
  {
    name: 'map-timeline',
    device: 'desktop',
    crop: { x: 376, y: 66, width: 640, height: 518 },
    outputWidth: NATIVE,
    startHash: '',
    async prepare(page) {
      const dots = await laneDots(page, LANE_BAND);
      const first = dots[Math.floor(dots.length * 0.2)];
      const second = dots[Math.floor(dots.length * 0.75)];
      if (first === undefined || second === undefined) throw new Error(`the ${LANE_BAND} lane has too few shows to hover`);
      const map = await boxOf(page.locator('.map-surface'));
      const pin = await pinNear(page, { x: map.x + map.width * 0.33, y: map.y + map.height * 0.15, width: map.width * 0.25, height: map.height * 0.3 });
      return { cursorStart: { x: second.x + 120, y: second.y + 60 }, targets: [first, second, pin] };
    },
    async play({ page, director }, { targets: [firstDot, secondDot, pin] }) {
      if (firstDot === undefined || secondDot === undefined || pin === undefined) throw new Error('map-timeline needs two dots and a pin');
      await director.wait(400);
      await director.glide(firstDot.x, firstDot.y, 700);
      await expectTooltip(page, LANE_BAND);
      await director.wait(1100);
      await director.glide(secondDot.x, secondDot.y, 700);
      await expectTooltip(page, LANE_BAND);
      await director.wait(1100);
      await director.glide(pin.x, pin.y, 800);
      await expectTooltip(page, null);
      await director.wait(1300);
    },
  },
  {
    name: 'filters',
    device: 'desktop',
    crop: WHOLE_DESKTOP,
    outputWidth: WHOLE_DESKTOP_WIDTH,
    startHash: '',
    async prepare(page) {
      await page.locator('#tab-genres').click();
      const checkbox = genreCheckbox(page);
      await checkbox.scrollIntoViewIfNeeded();
      const box = await boxOf(checkbox);
      return { cursorStart: { x: box.x + 420, y: box.y - 40 }, targets: [] };
    },
    async play({ page, director }) {
      await director.wait(300);
      await director.clickOn(genreCheckbox(page), 550);
      await waitForUrl(page, (url) => hashParam(url, 'tags') === GENRE.id, `gained tags=${GENRE.id}`);
      await director.wait(800);
      await director.clickOn(page.locator('#timeline-controls button').filter({ hasText: /^3M$/ }), 550);
      await waitForUrl(page, (url) => hashParam(url, 'when') === 'next-3-months', 'gained when=next-3-months');
      await director.wait(800);
      await chooseMapArea(page, director, PICK_AREA);
      await waitForUrl(page, (url) => hashParam(url, 'view') === 'europe', 'gained view=europe');
      await director.wait(1500);
    },
  },
  {
    name: 'around-a-place',
    device: 'phone',
    crop: WHOLE_PHONE,
    outputWidth: PHONE_WIDTH,
    startHash: '',
    async prepare(page) {
      const target = await calibratePlace(page, PICK_AREA, PICKED_PLACE, AROUND_RADIUS_LABEL);
      await chooseMapArea(page, createDirector(page, { x: 0, y: 0 }, 0), PICK_AREA);
      await waitForMapToSettle(page);
      return { cursorStart: null, targets: [target] };
    },
    async play({ page, director, touch }, { targets: [place] }) {
      if (place === undefined) throw new Error(`around-a-place needs the spot of ${PICKED_PLACE.name}`);
      await director.wait(500);
      await touch.press(place, 1150);
      const menu = page.locator('.map-point-menu');
      await menu.waitFor({ state: 'visible', timeout: 2000 });
      await expectText(menu.locator('.menu-heading'), 'Shows around here');
      await director.wait(700);
      await touch.tapOn(radiusChip(page, AROUND_RADIUS_LABEL));
      await waitForMapToSettle(page);
      await expectText(page.locator('.map-status'), PICKED_PLACE.name);
      await director.wait(800);
      await touch.tapOn(page.locator('#map-status button').filter({ hasText: 'List these shows' }));
      await director.wait(1600);
    },
  },
  {
    name: 'follow-a-tour',
    device: 'desktop',
    crop: { x: 0, y: 0, width: 1024, height: 588 },
    outputWidth: WHOLE_DESKTOP_WIDTH,
    startHash: '',
    async prepare(page) {
      await requireSearchResult(page, TOUR_BAND, 'follow-a-tour');
      const search = await boxOf(page.locator('#search-input'));
      return { cursorStart: { x: search.x + search.width * 0.8, y: search.y + 140 }, targets: [] };
    },
    async play({ page, director }) {
      await director.wait(300);
      const search = page.locator('#search-input');
      await director.clickOn(search, 500);
      await search.pressSequentially(TOUR_BAND, { delay: 55 });
      await director.wait(250);
      await director.clickOn(page.locator('.search-option').first(), 400);
      await page.locator('.timeline-playhead:not([hidden])').waitFor({ timeout: 3000 });
      await expectText(page.locator('#selection-panel'), TOUR_BAND);
      await director.glide(720, 400, 500);
      await director.wait(3700);
    },
  },
  {
    name: 'share',
    device: 'desktop',
    crop: { x: 384, y: 0, width: 640, height: 400 },
    outputWidth: NATIVE,
    startHash: '#when=next-3-months&view=europe',
    async prepare() {
      return { cursorStart: { x: 760, y: 330 }, targets: [] };
    },
    async play({ page, director }) {
      await director.wait(400);
      await director.clickOn(page.locator('#share-button'), 600);
      await director.wait(700);
      const copy = page.locator('#share-panel button').filter({ hasText: 'Copy link' });
      await director.clickOn(copy, 500);
      await expectText(page.locator('#share-panel'), 'Link copied');
      const copied = await page.evaluate(() => (globalThis as unknown as PageScope).navigator.clipboard.readText());
      if (copied !== page.url()) throw new Error(`Copy link should copy ${page.url()}, but the clipboard holds "${copied}"`);
      await director.wait(1500);
    },
  },
  {
    name: 'mobile',
    device: 'phone',
    crop: WHOLE_PHONE,
    outputWidth: PHONE_WIDTH,
    startHash: '',
    async prepare(page) {
      await boxOf(page.locator('#sidebar-toggle'));
      return { cursorStart: null, targets: [] };
    },
    async play({ page, director, touch }) {
      const viewport = DEVICES.phone.viewport;
      const handleCentre = async () => {
        const handle = await boxOf(page.locator('#sidebar-toggle'));
        return { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      };
      await director.wait(300);
      let from = await handleCentre();
      await touch.drag(from, { x: from.x, y: viewport.height * 0.55 }, 400);
      await director.wait(600);
      from = await handleCentre();
      await touch.drag(from, { x: from.x, y: viewport.height * 0.12 }, 400);
      await director.wait(500);
      await touch.tapOn(page.locator('.band-select').filter({ hasText: LANE_BAND }));
      await expectText(page.locator('#selection-panel'), LANE_BAND);
      await director.wait(1500);
      await touch.tapOn(page.locator('.selection-back'));
      await director.wait(800);
    },
  },
  {
    name: 'your-way',
    device: 'desktop',
    crop: WHOLE_DESKTOP,
    outputWidth: WHOLE_DESKTOP_WIDTH,
    startHash: '',
    async prepare(page) {
      await page.locator('#settings-button').click();
      for (const style of ['bold', 'soft', 'atlas', 'stage']) {
        await page.locator('#settings-style').selectOption(style);
        await page.evaluate(() => (globalThis as unknown as PageScope).document.fonts.ready.then(() => undefined));
      }
      await page.keyboard.press('Escape');
      const gear = await boxOf(page.locator('#settings-button'));
      return { cursorStart: { x: gear.x - 160, y: gear.y + 260 }, targets: [] };
    },
    async play(scene) {
      const { page, director } = scene;
      await director.wait(200);
      await director.clickOn(page.locator('#settings-button'), 450);
      await director.wait(200);
      await chooseSetting(scene, '#settings-clock', '12', 'clock=12');
      await chooseSetting(scene, '#settings-language', 'de', 'lang=de');
      await expectText(page.locator('#settings-panel'), 'Einstellungen');
      await chooseSetting(scene, '#settings-distance', 'mi', 'units=mi');
      for (const style of ['bold', 'soft', 'atlas']) await chooseSetting(scene, '#settings-style', style, null);
      await director.clickOn(page.locator('#settings-panel .theme-switch label').nth(1), 300);
      await director.wait(900);
    },
  },
];

runCli(USAGE.replace('{clips}', CLIPS.map((clip) => `  ${clip.name} (${clip.device})`).join('\n')), async () => {
  const args = parseArguments(process.argv.slice(2), [], []);
  const clips = args.positional.length === 0 ? CLIPS : args.positional.map(clipNamed);
  requireDist('feature-clips');
  requireFfmpeg();
  requireCommand('img2webp', ['-version'], 'It comes with libwebp: install it (macOS: "brew install webp", Debian/Ubuntu: "sudo apt install webp") and run again.');
  const executablePath = chromiumExecutable();

  mkdirSync('.cache', { recursive: true });
  const workDir = resolve(mkdtempSync(join('.cache', 'feature-clips-')));
  const server = await startPreview([]);
  const encoded: EncodedClip[] = [];
  try {
    const browser = await chromium.launch({ executablePath, args: ['--hide-scrollbars'] });
    try {
      for (const clip of clips) {
        console.log(`Recording ${clip.name}`);
        encoded.push(await recordClip(browser, server.url, clip, join(workDir, clip.name)));
      }
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`Recording failed; ${OUTPUT_DIR}/ is untouched and the frames so far are in ${workDir}`);
    throw error;
  } finally {
    await server.close();
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report = encoded.map((clip) => {
    const line = publish(clip.file, join(OUTPUT_DIR, `${clip.name}.webp`));
    return `${line}; ${clip.device}, ${clip.size.width}x${clip.size.height}, ${clip.duration.toFixed(1)} s, quality ${clip.quality}`;
  });
  rmSync(workDir, { recursive: true });
  for (const line of report) console.log(line);
  return 0;
});

function clipNamed(name: string): Clip {
  const clip = CLIPS.find((candidate) => candidate.name === name);
  if (clip === undefined) throw new UsageError(`there is no clip "${name}"`);
  return clip;
}

async function recordClip(browser: Browser, baseUrl: string, clip: Clip, clipDir: string): Promise<EncodedClip> {
  const device = DEVICES[clip.device];
  const framesDir = join(clipDir, 'frames');
  const pngDir = join(clipDir, 'png');
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(pngDir);

  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.touch,
    hasTouch: device.touch,
    colorScheme: 'dark',
    locale: 'en-GB',
    bypassCSP: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: 'no-preference',
  });
  let spans: Span[];
  let recording: Recording;
  try {
    await serveSiteFrom(context, baseUrl);
    await context.addInitScript({ path: device.overlayScript });
    const page = await context.newPage();
    await openApp(page, clip.startHash);
    const setup = await clip.prepare(page);
    const pointer = mousePosition(device, setup, clip.name);
    await page.mouse.move(pointer.x, pointer.y);
    const director = createDirector(page, pointer, 1);
    const cdp = await context.newCDPSession(page);
    const screencast = await startScreencast(page, framesDir, {
      width: device.viewport.width * device.deviceScaleFactor,
      height: device.viewport.height * device.deviceScaleFactor,
    });
    await page.waitForTimeout(300);
    spans = [];
    let rollingSince = Date.now() / 1000;
    const scene: Scene = {
      page,
      director,
      touch: createTouch(page, cdp),
      async offCamera(action) {
        spans.push({ start: rollingSince, end: Date.now() / 1000 });
        await action();
        await page.waitForTimeout(150);
        rollingSince = Date.now() / 1000;
      },
    };
    await clip.play(scene, setup);
    spans.push({ start: rollingSince, end: Date.now() / 1000 });
    recording = await screencast.stop();
  } finally {
    await context.close();
  }

  const outputWidth = clip.outputWidth === NATIVE ? clip.crop.width : clip.outputWidth;
  const { frames, duration } = spliceSpans(recording.frames, spans);
  const listFile = join(clipDir, 'frames.txt');
  writeFileSync(listFile, concatList(frames, duration));
  checkClipDuration(clip.name, duration);
  runCommand('ffmpeg', pngFrameArguments(listFile, duration, cropScaleFilter(device.viewport, clip.crop, outputWidth), join(pngDir, '%04d.png')));
  const pngFiles = readdirSync(pngDir)
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => join(pngDir, file));

  const output = join(clipDir, `${clip.name}.webp`);
  let quality: number | null = WEBP_QUALITIES[0] ?? null;
  let used = quality;
  while (quality !== null) {
    runCommand('img2webp', img2webpArguments(pngFiles, quality, output));
    used = quality;
    quality = nextQuality(clip.name, quality, statSync(output).size, CLIP_BUDGET_BYTES);
  }
  if (used === null) throw new Error('there is no WebP quality to try');
  return { name: clip.name, device: clip.device, file: output, duration, size: outputSize(clip.crop, outputWidth), quality: used };
}

/** Desktop clips start the cursor where they asked; on phones the unseen mouse stays in the corner, off the map, so nothing shows hover. */
function mousePosition(device: Device, setup: ClipSetup, name: string): ScreenPoint {
  if (device.touch) {
    if (setup.cursorStart !== null) throw new Error(`the ${name} clip runs on a phone, which shows no cursor, but asks for one at ${JSON.stringify(setup.cursorStart)}`);
    return { x: 0, y: 0 };
  }
  if (setup.cursorStart === null) throw new Error(`the ${name} clip runs on a desktop and needs a cursor start`);
  return setup.cursorStart;
}

/** Answers every request for SITE_URL from the preview server, so the app runs under the address the clips show. */
async function serveSiteFrom(context: BrowserContext, baseUrl: string): Promise<void> {
  const site = new URL(SITE_URL);
  await context.route(`${SITE_URL}**`, async (route) => {
    const requested = new URL(route.request().url());
    const local = new URL(requested.pathname.slice(site.pathname.length) + requested.search, baseUrl);
    await route.fulfill({ response: await route.fetch({ url: local.href }) });
  });
}

async function openApp(page: Page, hash: string): Promise<void> {
  await page.goto(new URL(hash, SITE_URL).href);
  await waitForApp(page);
}

async function waitForApp(page: Page): Promise<void> {
  await page.locator('.map-zoom-layer').waitFor();
  await page.evaluate(() => (globalThis as unknown as PageScope).document.fonts.ready.then(() => undefined));
  await page.locator('html.is-loading').waitFor({ state: 'detached', timeout: 10_000 });
  await waitForMapToSettle(page);
  await page.waitForTimeout(800);
}

function hashParam(url: string, name: string): string | null {
  return new URLSearchParams(new URL(url).hash.slice(1)).get(name);
}

async function expectText(locator: Locator, text: string): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const content = await locator.textContent();
    if (content !== null && content.includes(text)) return;
    if (Date.now() > deadline) throw new Error(`${locator} should contain "${text}", but reads "${content}"`);
    await locator.page().waitForTimeout(50);
  }
}

const VISIBLE_TOOLTIP = '.tooltip:not([hidden])';

/** Throws unless a tooltip is up, naming `band` when given. */
async function expectTooltip(page: Page, band: string | null): Promise<void> {
  const tooltip = page.locator(VISIBLE_TOOLTIP);
  await tooltip.first().waitFor({ timeout: 1000 }).catch((error: unknown) => {
    throw new Error(`hovering should show a ${band ?? 'pin'} tooltip, but none is up`, { cause: error });
  });
  if (band !== null) await expectText(tooltip.first(), band);
}

async function tooltipText(page: Page): Promise<string | null> {
  return page.evaluate((selector) => (globalThis as unknown as PageScope).document.querySelector(selector)?.textContent ?? null, VISIBLE_TOOLTIP);
}

function genreCheckbox(page: Page): Locator {
  return page.getByRole('checkbox', { name: new RegExp(GENRE.label) });
}

/**
 * Where the dots of a band's timeline lane are: the lanes are drawn on a canvas, so this hovers along each
 * lane and reads the tooltips. Lanes are compact (24 px) whenever more than 15 bands have shows.
 */
async function laneDots(page: Page, band: string): Promise<ScreenPoint[]> {
  const lanes = await boxOf(page.locator('.timeline-viewport'));
  const laneHeight = 24;
  const step = 3;
  const visibleLanes = Math.floor(lanes.height / laneHeight);
  for (let index = 0; index < visibleLanes; index++) {
    const y = lanes.y + index * laneHeight + laneHeight / 2;
    const along = pointsAlong({ x: lanes.x + lanes.width * 0.12, y }, { x: lanes.x + lanes.width - 6, y }, step);
    const hits: ScreenPoint[] = [];
    let laneBand: string | null = null;
    for (const point of along) {
      await page.mouse.move(point.x, point.y);
      const text = await tooltipText(page);
      if (text === null) continue;
      laneBand ??= text;
      if (!text.includes(band)) break;
      if (hits.every((hit) => point.x - hit.x > 14)) hits.push(point);
    }
    if (hits.length > 0) {
      await page.mouse.move(lanes.x + lanes.width / 2, lanes.y - 60);
      return hits;
    }
  }
  throw new Error(`no lane among the first ${visibleLanes} of the timeline shows ${band}; pick a band near the top of the alphabet`);
}

/** A map pin in the region, found by hovering a grid from its middle outwards until a tooltip comes up. */
async function pinNear(page: Page, region: Region): Promise<ScreenPoint> {
  const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
  for (const point of gridAround(region, centre, 4)) {
    await page.mouse.move(point.x, point.y);
    if ((await tooltipText(page)) !== null) {
      await page.mouse.move(region.x, region.y + region.height + 200);
      return point;
    }
  }
  throw new Error(`no map pin within ${JSON.stringify(region)}`);
}

/** Changes a select of the settings; a locale change reloads the page, which happens off camera before the settings reopen. */
async function chooseSetting(scene: Scene, selector: string, value: string, reloadsWith: string | null): Promise<void> {
  const { page, director } = scene;
  const box = await boxOf(page.locator(selector));
  const centre = { x: box.x + box.width * 0.6, y: box.y + box.height / 2 };
  await director.glide(centre.x, centre.y, 250);
  await director.wait(100);
  if (reloadsWith === null) {
    await page.locator(selector).selectOption(value);
    await director.wait(300);
    return;
  }
  await director.wait(100);
  await scene.offCamera(async () => {
    await Promise.all([page.waitForEvent('load'), page.locator(selector).selectOption(value)]);
    if (!new URL(page.url()).hash.includes(reloadsWith)) throw new Error(`choosing ${value} in ${selector} should reload with ${reloadsWith}, but the URL is ${page.url()}`);
    await waitForApp(page);
    await page.locator('#settings-button').click();
    await page.locator('#settings-panel').waitFor();
    await director.jump(centre.x, centre.y);
  });
  await director.wait(400);
}

function createTouch(page: Page, cdp: CDPSession): Touch {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', point: ScreenPoint | null) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point === null ? [] : [{ x: point.x, y: point.y }] });
  const tap = async (point: ScreenPoint) => {
    await send('touchStart', point);
    await page.waitForTimeout(90);
    await send('touchEnd', null);
    await page.waitForTimeout(150);
  };
  return {
    tap,
    async tapOn(locator) {
      const box = await boxOf(locator);
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const viewport = page.viewportSize();
      if (viewport === null) throw new Error('the page has no viewport to tap in');
      if (centre.x < 0 || centre.y < 0 || centre.x > viewport.width || centre.y > viewport.height) {
        throw new Error(`${locator} is outside the window at ${Math.round(centre.x)},${Math.round(centre.y)}, so it cannot be tapped`);
      }
      await tap(centre);
    },
    async press(point, ms) {
      await send('touchStart', point);
      await page.waitForTimeout(ms);
      await send('touchEnd', null);
    },
    async drag(from, to, ms) {
      await send('touchStart', from);
      await page.waitForTimeout(60);
      for (const point of pointsAlong(from, to, Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) / Math.max(4, Math.round(ms / 16))))) {
        await send('touchMove', point);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(60);
      await send('touchEnd', null);
    },
  };
}
