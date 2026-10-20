import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { preview, type Plugin, type PreviewServer } from 'vite';
import { parseArguments, runCli, UsageError } from './shared/files.ts';
import {
  calibrateScreen,
  concatList,
  encodeArguments,
  frameAt,
  parseAroundPoint,
  playBadgePixels,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  posterArguments,
  screenPointOf,
  totalDuration,
  type CalibrationSample,
  type GeoPoint,
  type ScreencastFrame,
  type ScreenPoint,
} from './shared/demoVideo.ts';

const CHROMIUM_VARIABLE = 'TOUR_ATLAS_CHROMIUM';

const USAGE = `Usage: node tools/demo-video.ts   (or: npm run demo-video, which builds first)

Records the 50-second demo of the built app in dist/ with headless Chromium and encodes it with ffmpeg:
docs/demo.mp4 (1920x1080, H.264) and its poster docs/demo-poster.jpg, both linked from README.md.
It uses the real band data, so the video changes with it; re-run it after notable data or interface changes.

Needs a build (dist/index.html), ffmpeg on the PATH and a Chromium for playwright-core:
  npx playwright-core install chromium
or ${CHROMIUM_VARIABLE}=<path to a Chrome or Chromium executable>.
Frames go to a temporary directory under .cache/, removed after a successful run.`;

const DIST_DIR = 'dist';
const VIDEO_PATH = 'docs/demo.mp4';
const POSTER_PATH = 'docs/demo-poster.jpg';
const PHONE_PAGE_PATH = 'tools/demo/phone.html';
const OVERLAY_SCRIPT_PATH = 'tools/demo/overlay.js';
const PHONE_PAGE_ROUTE = '/demo-phone.html';
const PHONE_FONT_ROUTES: Readonly<Record<string, string>> = {
  '/demo-phone/inter-tight-latin-300-normal.woff2': '@fontsource/inter-tight/files/inter-tight-latin-300-normal.woff2',
  '/demo-phone/inter-tight-latin-400-normal.woff2': '@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff2',
  '/demo-phone/inter-tight-latin-700-normal.woff2': '@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff2',
};

const VIEWPORT = { width: 1920, height: 1080 } as const;
/** Every scripted pause and movement takes this many times its nominal length. */
const PACE = 1.5;
type CardLine = readonly ['wordmark', heavy: string, light: string] | readonly ['p', string];
const TITLE_CARD: readonly CardLine[] = [
  ['wordmark', 'Tour', 'Atlas'],
  ['p', 'Follow your favourite bands on tour through space and time'],
];
const TOUR_BAND = 'Sabaton';
const PICKED_PLACE = { name: 'Stockholm', geo: { lat: 59.33, lon: 18.07 } } as const;
const AROUND_RADIUS_LABEL = '250';
const MAP_SETTLE = { quietMs: 400, minimumMs: 300, timeoutMs: 15_000 } as const;

interface DemoOverlay {
  caption(text: string | null): void;
  card(lines: readonly CardLine[] | null): void;
}
interface PhoneFrame {
  load(src: string): void;
  fontsReady(): Promise<void>;
  reveal(): void;
}
interface DemoScope {
  readonly __demo: DemoOverlay;
  readonly __phone: PhoneFrame;
}

interface Recording {
  readonly frames: readonly ScreencastFrame[];
  readonly stoppedAt: number;
  readonly posterAt: number;
}

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), [], []);
  if (args.positional.length > 0) throw new UsageError('demo-video takes no arguments');
  if (!existsSync(join(DIST_DIR, 'index.html'))) throw new Error(`${DIST_DIR}/index.html is missing: run "npm run build" first (npm run demo-video does)`);
  requireFfmpeg();
  const executablePath = chromiumExecutable();

  mkdirSync('.cache', { recursive: true });
  const workDir = resolve(mkdtempSync(join('.cache', 'demo-video-')));
  const framesDir = join(workDir, 'frames');
  mkdirSync(framesDir);

  const port = await freePort();
  const server = await preview({
    configFile: false,
    root: process.cwd(),
    logLevel: 'warn',
    build: { outDir: DIST_DIR },
    preview: { host: '127.0.0.1', port, strictPort: true, open: false },
    plugins: [demoPhonePlugin()],
  });
  let recording: Recording;
  try {
    recording = await record(executablePath, previewUrl(server), framesDir);
  } catch (error) {
    console.error(`Recording failed; frames so far are in ${workDir}`);
    throw error;
  } finally {
    await server.close();
  }

  const duration = totalDuration(recording.frames, recording.stoppedAt);
  const listFile = join(workDir, 'frames.txt');
  writeFileSync(listFile, concatList(recording.frames, recording.stoppedAt));
  const video = join(workDir, 'demo.mp4');
  runFfmpeg(encodeArguments(listFile, duration, video));

  const badgeFile = join(workDir, 'play-badge.rgba');
  writeFileSync(badgeFile, playBadgePixels(POSTER_WIDTH, POSTER_HEIGHT));
  const poster = join(workDir, 'demo-poster.jpg');
  runFfmpeg(posterArguments(frameAt(recording.frames, recording.posterAt).file, badgeFile, poster));

  const report = [publish(video, VIDEO_PATH), publish(poster, POSTER_PATH)];
  rmSync(workDir, { recursive: true });
  console.log(`${recording.frames.length} frames, ${duration.toFixed(1)} s`);
  for (const line of report) console.log(line);
  return 0;
});

function requireFfmpeg(): void {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.error !== undefined || probe.status !== 0) {
    throw new Error('ffmpeg is not on the PATH. Install it (macOS: "brew install ffmpeg", Debian/Ubuntu: "sudo apt install ffmpeg") and run again.');
  }
}

function runFfmpeg(args: readonly string[]): void {
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

function chromiumExecutable(): string {
  const configured = process.env[CHROMIUM_VARIABLE];
  if (configured !== undefined && configured !== '') {
    if (!existsSync(configured)) throw new Error(`${CHROMIUM_VARIABLE} points to ${configured}, which does not exist`);
    return configured;
  }
  const bundled = chromium.executablePath();
  if (!existsSync(bundled)) {
    throw new Error(
      `No Chromium for playwright-core at ${bundled}. Run "npx playwright-core install chromium", or set ${CHROMIUM_VARIABLE} to a Chrome or Chromium executable.`,
    );
  }
  return bundled;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        reject(new Error('could not find a free port'));
        return;
      }
      probe.close(() => resolvePort(address.port));
    });
  });
}

function previewUrl(server: PreviewServer): string {
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error('the preview server did not report its address');
  return url;
}

/** Serves the phone frame page and its fonts next to the built app; only for this preview, never in dist/. */
function demoPhonePlugin(): Plugin {
  const require = createRequire(import.meta.url);
  return {
    name: 'tour-atlas:demo-phone',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        const font = PHONE_FONT_ROUTES[path];
        if (path === PHONE_PAGE_ROUTE) {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(readFileSync(PHONE_PAGE_PATH));
        } else if (font !== undefined) {
          response.setHeader('Content-Type', 'font/woff2');
          response.end(readFileSync(require.resolve(font)));
        } else {
          next();
        }
      });
    },
  };
}

function publish(source: string, target: string): string {
  const before = existsSync(target) ? statSync(target).size : null;
  renameSync(source, target);
  const after = statSync(target).size;
  const size = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `Wrote ${target}: ${size(after)}${before === null ? '' : ` (was ${size(before)})`}`;
}

async function record(executablePath: string, baseUrl: string, framesDir: string): Promise<Recording> {
  const browser = await chromium.launch({ executablePath, args: ['--hide-scrollbars'] });
  try {
    return await recordScenes(browser, baseUrl, framesDir);
  } finally {
    await browser.close();
  }
}

async function recordScenes(browser: Browser, baseUrl: string, framesDir: string): Promise<Recording> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    locale: 'en-GB',
    bypassCSP: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: 'no-preference',
  });
  await context.addInitScript({ path: OVERLAY_SCRIPT_PATH });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.locator('.map-zoom-layer').waitFor();
  await page.waitForTimeout(2500);

  await requireTourBand(page);
  const pickTarget = await calibratePickTarget(page);
  await page.locator('#home-link').click();
  await waitForMapToSettle(page);

  const director = createDirector(page, { x: 1100, y: 700 }, PACE);
  await director.card(TITLE_CARD);
  await page.mouse.move(1100, 700);
  await page.waitForTimeout(900);

  const cdp = await context.newCDPSession(page);
  const frames: ScreencastFrame[] = [];
  let frameFailure: unknown = null;
  let stopped = false;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    if (stopped) return;
    if (metadata.timestamp === undefined) {
      frameFailure = new Error('a screencast frame came without a timestamp');
      return;
    }
    const file = join(framesDir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, timestamp: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch((error: unknown) => {
      if (!stopped) frameFailure = error;
    });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 });

  const posterAt = await playScenes(page, director, baseUrl, pickTarget);

  const stoppedAt = Date.now() / 1000;
  stopped = true;
  await cdp.send('Page.stopScreencast');
  await director.wait(200);
  if (frameFailure !== null) throw new Error('the screencast failed', { cause: frameFailure });
  return { frames: frames.filter((frame) => frame.timestamp < stoppedAt), stoppedAt, posterAt };
}

/** Plays the eight scenes; returns when (epoch seconds) the area around Stockholm has settled, for the poster. */
async function playScenes(page: Page, director: Director, baseUrl: string, pickTarget: ScreenPoint): Promise<number> {
  const { wait, glide, clickOn, caption, card } = director;

  // Title card
  await wait(1600);
  await card(null);
  await wait(500);

  // Map and timeline, linked on hover
  await caption('Every show on one map and timeline.');
  const timeline = await boxOf(page.locator('#timeline'));
  const laneY = timeline.y + timeline.height * 0.25;
  await glide(timeline.x + timeline.width * 0.25, laneY, 900);
  await wait(500);
  await glide(timeline.x + timeline.width * 0.6, laneY, 1200);
  await wait(300);
  await caption(null);

  // Follow a tour
  await wait(250);
  await caption('Follow a tour, leg by leg.');
  const search = page.locator('#search-input');
  await clickOn(search, 650);
  await search.pressSequentially(TOUR_BAND, { delay: 80 * PACE });
  await wait(400);
  await clickOn(page.locator('.search-option').first(), 450);
  await glide(1200, 640, 500);
  await wait(3800);
  await caption(null);
  await clickOn(page.locator('#home-link'), 600);
  await wait(900);

  // Shows around a picked point
  await caption('Shows around any place.');
  await chooseEurope(page, clickOn, wait);
  await wait(1500);
  await glide(pickTarget.x, pickTarget.y, 700);
  await wait(250);
  await page.mouse.click(pickTarget.x, pickTarget.y, { button: 'right' });
  await wait(700);
  await clickOn(radiusChip(page), 500);
  const sceneEnd = Date.now() + 2000 * PACE;
  await waitForMapToSettle(page);
  const posterAt = Date.now() / 1000;
  const status = await page.locator('.map-status').textContent();
  if (status === null || !status.includes(PICKED_PLACE.name)) {
    throw new Error(`the area should be named after ${PICKED_PLACE.name}, but the map status reads "${status}"`);
  }
  const remaining = sceneEnd - Date.now();
  if (remaining < 0) throw new Error(`the map took ${-remaining} ms longer to settle than the scene lasts`);
  await page.waitForTimeout(remaining);
  await caption(null);

  // Filters combine
  await wait(200);
  await caption('Filters that work together, in any order.');
  await clickOn(page.locator('#timeline-controls button').filter({ hasText: /^3M$/ }), 650);
  await wait(2200);
  await caption(null);

  // Share
  await wait(200);
  await caption('Share exactly what you see.');
  await clickOn(page.locator('#share-button'), 650);
  await wait(600);
  await clickOn(page.locator('#share-panel button').filter({ hasText: 'Copy link' }), 500);
  await wait(1600);
  await page.keyboard.press('Escape');
  await wait(300);
  await caption(null);

  // Phone
  const appHash = new URL(page.url()).hash;
  await page.goto(new URL(PHONE_PAGE_ROUTE, baseUrl).href);
  await caption('On your phone too.');
  await page.evaluate((src) => (globalThis as unknown as DemoScope).__phone.load(src), new URL(appHash, baseUrl).href);
  await page.frameLocator('#app').locator('#map').waitFor();
  await page.evaluate(() => (globalThis as unknown as DemoScope).__phone.fontsReady());
  await page.waitForTimeout(1100);
  await page.evaluate(() => (globalThis as unknown as DemoScope).__phone.reveal());
  await director.jump(1300, 800);
  await wait(700);
  const phone = await boxOf(page.locator('.phone'));
  await glide(phone.x + phone.width * 0.56, phone.y + phone.height * 0.314, 900);
  await wait(2000);
  await caption(null);
  await wait(450);

  // End card
  await card(TITLE_CARD);
  await wait(2800);
  return posterAt;
}

interface Director {
  wait(ms: number): Promise<void>;
  glide(x: number, y: number, ms: number): Promise<void>;
  clickOn(locator: Locator, ms: number): Promise<void>;
  jump(x: number, y: number): Promise<void>;
  caption(text: string | null): Promise<void>;
  card(lines: readonly CardLine[] | null): Promise<void>;
}

/** Moves the visible cursor and shows captions; `pace` stretches every pause and movement (0: as fast as possible). */
function createDirector(page: Page, start: ScreenPoint, pace: number): Director {
  let pointer = start;
  const wait = (ms: number) => page.waitForTimeout(ms * pace);
  const glide = async (x: number, y: number, ms: number) => {
    const steps = Math.max(8, Math.round(ms / 32));
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      await page.mouse.move(pointer.x + (x - pointer.x) * eased, pointer.y + (y - pointer.y) * eased);
      await wait(16);
    }
    pointer = { x, y };
  };
  return {
    wait,
    glide,
    async clickOn(locator, ms) {
      const box = await boxOf(locator);
      await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
      await wait(120);
      await page.mouse.down();
      await wait(70);
      await page.mouse.up();
    },
    async jump(x, y) {
      await page.mouse.move(x, y);
      pointer = { x, y };
    },
    async caption(text) {
      await page.evaluate((value) => (globalThis as unknown as DemoScope).__demo.caption(value), text);
    },
    async card(lines) {
      await page.evaluate((value) => (globalThis as unknown as DemoScope).__demo.card(value), lines);
    },
  };
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator} is not visible`);
  return box;
}

function radiusChip(page: Page): Locator {
  return page.locator('.map-point-menu .menu-item').filter({ hasText: AROUND_RADIUS_LABEL }).first();
}

async function chooseEurope(page: Page, clickOn: Director['clickOn'], wait: Director['wait']): Promise<void> {
  await clickOn(page.getByRole('button', { name: /Map area/ }), 700);
  await wait(350);
  await clickOn(page.locator('#map-view-menu button', { hasText: /^Europe$/ }), 450);
}

async function requireTourBand(page: Page): Promise<void> {
  const search = page.locator('#search-input');
  await search.fill(TOUR_BAND);
  const options = page.locator('.search-option .search-option-label');
  await options
    .first()
    .waitFor({ timeout: 5000 })
    .catch((error: unknown) => {
      throw new Error(`the tour scene needs the band ${TOUR_BAND} in the data, but searching for it offers nothing`, { cause: error });
    });
  const first = await options.first().textContent();
  if (first !== TOUR_BAND) {
    throw new Error(`the tour scene needs the band ${TOUR_BAND} in the data, but searching for it offers "${first}" first`);
  }
  await search.fill('');
  await page.keyboard.press('Escape');
}

/** Polls the map's zoom transform until it has not changed for a while. */
async function waitForMapToSettle(page: Page): Promise<void> {
  const layer = page.locator('.map-zoom-layer');
  await page.waitForTimeout(MAP_SETTLE.minimumMs);
  const deadline = Date.now() + MAP_SETTLE.timeoutMs;
  let transform = await layer.getAttribute('transform');
  let quietSince = Date.now();
  while (Date.now() - quietSince < MAP_SETTLE.quietMs) {
    if (Date.now() > deadline) throw new Error(`the map kept moving for ${MAP_SETTLE.timeoutMs} ms`);
    await page.waitForTimeout(50);
    const current = await layer.getAttribute('transform');
    if (current !== transform) {
      transform = current;
      quietSince = Date.now();
    }
  }
}

async function waitForUrl(page: Page, matches: (url: string) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!matches(page.url())) {
    if (Date.now() > deadline) throw new Error(`the URL never ${what}; it is ${page.url()}`);
    await page.waitForTimeout(50);
  }
}

/**
 * Finds where the picked place lies on screen in the Europe view: right-clicks two spots, reads the point the
 * app puts into the URL for each, and maps screen to longitude and latitude linearly. A second pass close to
 * the first estimate makes the projection's curvature negligible.
 */
async function calibratePickTarget(page: Page): Promise<ScreenPoint> {
  const quick = createDirector(page, { x: 0, y: 0 }, 0);

  const sample = async (screen: ScreenPoint): Promise<CalibrationSample> => {
    await chooseEurope(page, quick.clickOn, quick.wait);
    await waitForMapToSettle(page);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await radiusChip(page).click();
    await waitForUrl(page, (url) => new URL(url).hash.includes('around='), 'gained around=<lat>,<lon>');
    const geo: GeoPoint = parseAroundPoint(page.url());
    await page.locator('#home-link').click();
    await waitForUrl(page, (url) => !new URL(url).hash.includes('around='), 'dropped around= after going home');
    await waitForMapToSettle(page);
    return { screen, geo };
  };

  const map = await boxOf(page.locator('.map-surface'));
  const wide = calibrateScreen(
    await sample({ x: map.x + map.width * 0.4, y: map.y + map.height * 0.3 }),
    await sample({ x: map.x + map.width * 0.6, y: map.y + map.height * 0.6 }),
  );
  const estimate = screenPointOf(wide, PICKED_PLACE.geo);
  const near = calibrateScreen(await sample({ x: estimate.x - 40, y: estimate.y - 30 }), await sample({ x: estimate.x + 40, y: estimate.y + 30 }));
  const target = screenPointOf(near, PICKED_PLACE.geo);
  const inside = target.x > map.x && target.x < map.x + map.width && target.y > map.y && target.y < map.y + map.height;
  if (!inside) throw new Error(`${PICKED_PLACE.name} would be at ${Math.round(target.x)},${Math.round(target.y)}, outside the map in the Europe view`);
  return target;
}
