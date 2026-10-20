import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { Plugin } from 'vite';
import {
  boxOf,
  calibratePlace,
  CHROMIUM_VARIABLE,
  chooseMapArea,
  chromiumExecutable,
  createDirector,
  publish,
  radiusChip,
  requireDist,
  requireFfmpeg,
  requireSearchResult,
  runCommand,
  startPreview,
  startScreencast,
  waitForMapToSettle,
  type Director,
  type Recording,
} from './shared/demoBrowser.ts';
import { concatList, encodeArguments, frameAt, playBadgePixels, POSTER_HEIGHT, POSTER_WIDTH, posterArguments, totalDuration, type ScreenPoint } from './shared/demoVideo.ts';
import { parseArguments, runCli, UsageError } from './shared/files.ts';

const USAGE = `Usage: node tools/demo-video.ts   (or: npm run demo-video, which builds first)

Records the 50-second demo of the built app in dist/ with headless Chromium and encodes it with ffmpeg:
docs/demo.mp4 (1920x1080, H.264) and its poster docs/demo-poster.jpg, both linked from README.md.
It uses the real band data, so the video changes with it; re-run it after notable data or interface changes.

Needs a build (dist/index.html), ffmpeg on the PATH and a Chromium for playwright-core:
  npx playwright-core install chromium
or ${CHROMIUM_VARIABLE}=<path to a Chrome or Chromium executable>.
Frames go to a temporary directory under .cache/, removed after a successful run.`;

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
const PICK_AREA = 'Europe';

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

interface DemoRecording extends Recording {
  readonly posterAt: number;
}

interface DemoDirector extends Director {
  caption(text: string | null): Promise<void>;
  card(lines: readonly CardLine[] | null): Promise<void>;
}

runCli(USAGE, async () => {
  const args = parseArguments(process.argv.slice(2), [], []);
  if (args.positional.length > 0) throw new UsageError('demo-video takes no arguments');
  requireDist('demo-video');
  requireFfmpeg();
  const executablePath = chromiumExecutable();

  mkdirSync('.cache', { recursive: true });
  const workDir = resolve(mkdtempSync(join('.cache', 'demo-video-')));
  const framesDir = join(workDir, 'frames');
  mkdirSync(framesDir);

  const server = await startPreview([demoPhonePlugin()]);
  let recording: DemoRecording;
  try {
    recording = await record(executablePath, server.url, framesDir);
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
  runCommand('ffmpeg', encodeArguments(listFile, duration, video));

  const badgeFile = join(workDir, 'play-badge.rgba');
  writeFileSync(badgeFile, playBadgePixels(POSTER_WIDTH, POSTER_HEIGHT));
  const poster = join(workDir, 'demo-poster.jpg');
  runCommand('ffmpeg', posterArguments(frameAt(recording.frames, recording.posterAt).file, badgeFile, poster));

  const report = [publish(video, VIDEO_PATH), publish(poster, POSTER_PATH)];
  rmSync(workDir, { recursive: true });
  console.log(`${recording.frames.length} frames, ${duration.toFixed(1)} s`);
  for (const line of report) console.log(line);
  return 0;
});

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

async function record(executablePath: string, baseUrl: string, framesDir: string): Promise<DemoRecording> {
  const browser = await chromium.launch({ executablePath, args: ['--hide-scrollbars'] });
  try {
    return await recordScenes(browser, baseUrl, framesDir);
  } finally {
    await browser.close();
  }
}

async function recordScenes(browser: Browser, baseUrl: string, framesDir: string): Promise<DemoRecording> {
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

  await requireSearchResult(page, TOUR_BAND, 'tour');
  const pickTarget = await calibratePlace(page, PICK_AREA, PICKED_PLACE, AROUND_RADIUS_LABEL);
  await page.locator('#home-link').click();
  await waitForMapToSettle(page);

  const director = createDemoDirector(page, { x: 1100, y: 700 });
  await director.card(TITLE_CARD);
  await page.mouse.move(1100, 700);
  await page.waitForTimeout(900);

  const screencast = await startScreencast(page, framesDir, VIEWPORT);
  const posterAt = await playScenes(page, director, baseUrl, pickTarget);
  return { ...(await screencast.stop()), posterAt };
}

function createDemoDirector(page: Page, start: ScreenPoint): DemoDirector {
  return {
    ...createDirector(page, start, PACE),
    async caption(text) {
      await page.evaluate((value) => (globalThis as unknown as DemoScope).__demo.caption(value), text);
    },
    async card(lines) {
      await page.evaluate((value) => (globalThis as unknown as DemoScope).__demo.card(value), lines);
    },
  };
}

/** Plays the eight scenes; returns when (epoch seconds) the area around Stockholm has settled, for the poster. */
async function playScenes(page: Page, director: DemoDirector, baseUrl: string, pickTarget: ScreenPoint): Promise<number> {
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
  await chooseMapArea(page, director, PICK_AREA);
  await wait(1500);
  await glide(pickTarget.x, pickTarget.y, 700);
  await wait(250);
  await page.mouse.click(pickTarget.x, pickTarget.y, { button: 'right' });
  await wait(700);
  await clickOn(radiusChip(page, AROUND_RADIUS_LABEL), 500);
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
