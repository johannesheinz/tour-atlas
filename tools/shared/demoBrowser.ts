/** Browser, preview server and encoder plumbing for tools/feature-clips.ts. */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { preview, type Plugin } from 'vite';
import {
  calibrateScreen,
  parseAroundPoint,
  screenPointOf,
  type CalibrationSample,
  type GeoPoint,
  type ScreencastFrame,
  type ScreenPoint,
} from './screenRecording.ts';

export const CHROMIUM_VARIABLE = 'TOUR_ATLAS_CHROMIUM';
export const DIST_DIR = 'dist';
const MAP_SETTLE = { quietMs: 400, minimumMs: 300, timeoutMs: 15_000 } as const;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function requireDist(script: string): void {
  if (!existsSync(join(DIST_DIR, 'index.html'))) throw new Error(`${DIST_DIR}/index.html is missing: run "npm run build" first (npm run ${script} does)`);
}

/** Throws `installHint` when `command` cannot run on this machine. */
export function requireCommand(command: string, probeArguments: readonly string[], installHint: string): void {
  const probe = spawnSync(command, probeArguments, { stdio: 'ignore' });
  if (probe.error !== undefined || probe.status !== 0) throw new Error(`${command} is not on the PATH. ${installHint}`);
}

export function requireFfmpeg(): void {
  requireCommand('ffmpeg', ['-version'], 'Install it (macOS: "brew install ffmpeg", Debian/Ubuntu: "sudo apt install ffmpeg") and run again.');
}

export function runCommand(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

export function chromiumExecutable(): string {
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

export interface RunningPreview {
  readonly url: string;
  close(): Promise<void>;
}

/** Vite's preview server for dist/ on a free local port. */
export async function startPreview(plugins: readonly Plugin[]): Promise<RunningPreview> {
  const port = await freePort();
  const server = await preview({
    configFile: false,
    root: process.cwd(),
    logLevel: 'warn',
    build: { outDir: DIST_DIR },
    preview: { host: '127.0.0.1', port, strictPort: true, open: false },
    plugins: [...plugins],
  });
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await server.close();
    throw new Error('the preview server did not report its address');
  }
  return { url, close: () => server.close() };
}

/** Moves a finished file into place and reports its size, and the size of the file it replaced. */
export function publish(source: string, target: string): string {
  const before = existsSync(target) ? statSync(target).size : null;
  renameSync(source, target);
  const after = statSync(target).size;
  const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.round(bytes / 1000)} kB` : `${(bytes / 1_000_000).toFixed(2)} MB`);
  return `Wrote ${target}: ${size(after)}${before === null ? '' : ` (was ${size(before)})`}`;
}

export interface Recording {
  readonly frames: readonly ScreencastFrame[];
  /** When the screencast stopped, in epoch seconds like the frame timestamps. */
  readonly stoppedAt: number;
}

export interface Screencast {
  stop(): Promise<Recording>;
}

/** Writes every CDP screencast frame of the page to `framesDir` as a JPEG, with the browser's timestamp. */
export async function startScreencast(page: Page, framesDir: string, maxSize: { readonly width: number; readonly height: number }): Promise<Screencast> {
  const cdp = await page.context().newCDPSession(page);
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: maxSize.width, maxHeight: maxSize.height, everyNthFrame: 1 });
  return {
    async stop() {
      const stoppedAt = Date.now() / 1000;
      stopped = true;
      await cdp.send('Page.stopScreencast');
      await page.waitForTimeout(200);
      await cdp.detach();
      if (frameFailure !== null) throw new Error('the screencast failed', { cause: frameFailure });
      return { frames: frames.filter((frame) => frame.timestamp < stoppedAt), stoppedAt };
    },
  };
}

export interface Director {
  wait(ms: number): Promise<void>;
  glide(x: number, y: number, ms: number): Promise<void>;
  clickOn(locator: Locator, ms: number): Promise<void>;
  jump(x: number, y: number): Promise<void>;
}

/** Moves the mouse in eased steps so the overlay's cursor glides; `pace` stretches every pause and movement (0: as fast as possible). */
export function createDirector(page: Page, start: ScreenPoint, pace: number): Director {
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
  };
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator} is not visible`);
  return box;
}

/** Polls the map's zoom transform until it has not changed for a while. */
export async function waitForMapToSettle(page: Page): Promise<void> {
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

export async function waitForUrl(page: Page, matches: (url: string) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!matches(page.url())) {
    if (Date.now() > deadline) throw new Error(`the URL never ${what}; it is ${page.url()}`);
    await page.waitForTimeout(50);
  }
}

export function radiusChip(page: Page, radiusLabel: string): Locator {
  return page.locator('.map-point-menu .menu-item').filter({ hasText: radiusLabel }).first();
}

export async function chooseMapArea(page: Page, director: Director, area: string): Promise<void> {
  await director.clickOn(page.getByRole('button', { name: /Map area/ }), 700);
  await director.wait(350);
  await director.clickOn(page.locator('#map-view-menu button', { hasText: new RegExp(`^${area}$`) }), 450);
}

/** Throws unless searching for the band offers it first, as the scenes that open it expect. */
export async function requireSearchResult(page: Page, band: string, scene: string): Promise<void> {
  const search = page.locator('#search-input');
  await search.fill(band);
  const options = page.locator('.search-option .search-option-label');
  await options
    .first()
    .waitFor({ timeout: 5000 })
    .catch((error: unknown) => {
      throw new Error(`the ${scene} scene needs the band ${band} in the data, but searching for it offers nothing`, { cause: error });
    });
  const first = await options.first().textContent();
  if (first !== band) throw new Error(`the ${scene} scene needs the band ${band} in the data, but searching for it offers "${first}" first`);
  await search.fill('');
  await page.keyboard.press('Escape');
}

export interface PlaceToPick {
  readonly name: string;
  readonly geo: GeoPoint;
}

/**
 * Finds where a place lies on screen in a map area: right-clicks two spots, reads the point the app puts into
 * the URL for each, and maps screen to longitude and latitude linearly. A second pass close to the first
 * estimate makes the projection's curvature negligible. Leaves the app in its default view.
 */
export async function calibratePlace(page: Page, area: string, place: PlaceToPick, radiusLabel: string): Promise<ScreenPoint> {
  const quick = createDirector(page, { x: 0, y: 0 }, 0);

  const sample = async (screen: ScreenPoint): Promise<CalibrationSample> => {
    await chooseMapArea(page, quick, area);
    await waitForMapToSettle(page);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await radiusChip(page, radiusLabel).click();
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
  const estimate = screenPointOf(wide, place.geo);
  const near = calibrateScreen(await sample({ x: estimate.x - 40, y: estimate.y - 30 }), await sample({ x: estimate.x + 40, y: estimate.y + 30 }));
  const target = screenPointOf(near, place.geo);
  const inside = target.x > map.x && target.x < map.x + map.width && target.y > map.y && target.y < map.y + map.height;
  if (!inside) throw new Error(`${place.name} would be at ${Math.round(target.x)},${Math.round(target.y)}, outside the map in the ${area} view`);
  return target;
}
