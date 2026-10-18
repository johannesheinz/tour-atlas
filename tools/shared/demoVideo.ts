/** Pure helpers for tools/demo-video.ts: screencast timing, map calibration and the ffmpeg command lines. */

/** A JPEG written from one CDP screencast frame; `timestamp` is the browser's frame time in seconds since the epoch. */
export interface ScreencastFrame {
  readonly file: string;
  readonly timestamp: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** A spot of the window and the place the app put into the URL for it. */
export interface CalibrationSample {
  readonly screen: ScreenPoint;
  readonly geo: GeoPoint;
}

/** Longitude follows x and latitude follows y, linearly: close enough within a few hundred pixels of a zoomed-in region. */
export interface ScreenCalibration {
  readonly origin: CalibrationSample;
  readonly lonPerPixel: number;
  readonly latPerPixel: number;
}

export const VIDEO_FPS = 30;
export const FADE_IN_SECONDS = 0.6;
export const FADE_OUT_SECONDS = 0.85;
/** The fade-out starts this long before the end, so the last few frames are fully black. */
export const FADE_OUT_LEAD_SECONDS = 0.9;

export const POSTER_WIDTH = 1280;
export const POSTER_HEIGHT = 720;

const PLAY_BADGE = {
  radius: 64,
  strokeWidth: 4,
  dim: [0, 0, 0, 0.18],
  disc: [10, 12, 20, 0.78],
  stroke: [255, 255, 255, 0.9],
  triangle: [255, 255, 255, 1],
  /** Corners relative to the centre: left top, right middle, left bottom. */
  triangleCorners: [
    [-20, -30],
    [32, 0],
    [-20, 30],
  ],
  samplesPerAxis: 4,
} as const;

function checkFrames(frames: readonly ScreencastFrame[], stoppedAt: number): void {
  const last = frames.at(-1);
  if (last === undefined) throw new Error('the screencast produced no frames');
  for (let index = 1; index < frames.length; index++) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (previous === undefined || current === undefined) throw new Error(`frame ${index} is missing`);
    if (current.timestamp <= previous.timestamp) throw new Error(`frame ${current.file} is not later than ${previous.file}`);
  }
  if (stoppedAt <= last.timestamp) throw new Error(`the recording stopped at ${stoppedAt}, not after its last frame at ${last.timestamp}`);
}

export interface TimedFrame {
  readonly frame: ScreencastFrame;
  readonly duration: number;
}

/** How long each frame stays on screen: until the next frame, and the last one until the recording stopped. */
export function timedFrames(frames: readonly ScreencastFrame[], stoppedAt: number): TimedFrame[] {
  checkFrames(frames, stoppedAt);
  return frames.map((frame, index) => ({ frame, duration: (frames[index + 1]?.timestamp ?? stoppedAt) - frame.timestamp }));
}

export function totalDuration(frames: readonly ScreencastFrame[], stoppedAt: number): number {
  return timedFrames(frames, stoppedAt).reduce((sum, { duration }) => sum + duration, 0);
}

/**
 * An ffmpeg concat demuxer list. The demuxer ignores the last entry's duration, so the last file is listed
 * once more; `-t` with the total duration then cuts the video where the recording stopped.
 */
export function concatList(frames: readonly ScreencastFrame[], stoppedAt: number): string {
  const timed = timedFrames(frames, stoppedAt);
  const lines = timed.flatMap(({ frame, duration }) => [`file ${quoteConcatPath(frame.file)}`, `duration ${duration.toFixed(6)}`]);
  const last = timed.at(-1);
  if (last === undefined) throw new Error('the screencast produced no frames');
  lines.push(`file ${quoteConcatPath(last.frame.file)}`);
  return `${lines.join('\n')}\n`;
}

function quoteConcatPath(path: string): string {
  if (path.includes('\n')) throw new Error(`frame path ${JSON.stringify(path)} contains a line break`);
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** The frame on screen at `timestamp`: the last one shown at or before it. */
export function frameAt(frames: readonly ScreencastFrame[], timestamp: number): ScreencastFrame {
  const shown = frames.findLast((frame) => frame.timestamp <= timestamp);
  if (shown === undefined) throw new Error(`no frame was shown at ${timestamp}; the first is at ${frames[0]?.timestamp ?? 'none'}`);
  return shown;
}

/** Reads `around=<lat>,<lon>` from a page URL's hash, where the app keeps a picked point. */
export function parseAroundPoint(url: string): GeoPoint {
  const around = new URLSearchParams(new URL(url).hash.slice(1)).get('around');
  if (around === null) throw new Error(`${url} has no around=<lat>,<lon> in its hash`);
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(around);
  if (match === null) throw new Error(`around=${around} in ${url} is not <lat>,<lon>`);
  return { lat: Number(match[1]), lon: Number(match[2]) };
}

export function calibrateScreen(first: CalibrationSample, second: CalibrationSample): ScreenCalibration {
  const dx = second.screen.x - first.screen.x;
  const dy = second.screen.y - first.screen.y;
  const dLon = second.geo.lon - first.geo.lon;
  const dLat = second.geo.lat - first.geo.lat;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) throw new Error('calibration points must differ by at least a pixel both across and down');
  if (dLon === 0 || dLat === 0) throw new Error('calibration points map to the same longitude or latitude; the map is not where it was expected');
  return { origin: first, lonPerPixel: dLon / dx, latPerPixel: dLat / dy };
}

export function screenPointOf(calibration: ScreenCalibration, geo: GeoPoint): ScreenPoint {
  const { origin } = calibration;
  return {
    x: origin.screen.x + (geo.lon - origin.geo.lon) / calibration.lonPerPixel,
    y: origin.screen.y + (geo.lat - origin.geo.lat) / calibration.latPerPixel,
  };
}

export function geoPointAt(calibration: ScreenCalibration, screen: ScreenPoint): GeoPoint {
  const { origin } = calibration;
  return {
    lat: origin.geo.lat + (screen.y - origin.screen.y) * calibration.latPerPixel,
    lon: origin.geo.lon + (screen.x - origin.screen.x) * calibration.lonPerPixel,
  };
}

export function encodeArguments(listFile: string, durationSeconds: number, output: string): string[] {
  const fadeOutStart = durationSeconds - FADE_OUT_LEAD_SECONDS;
  if (fadeOutStart <= FADE_IN_SECONDS) throw new Error(`a ${durationSeconds.toFixed(3)} s recording is too short to fade in and out`);
  const filters = [
    `fps=${VIDEO_FPS}`,
    `fade=t=in:st=0:d=${FADE_IN_SECONDS}`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE_OUT_SECONDS}`,
    'format=yuv420p',
  ];
  return [
    ...['-y', '-loglevel', 'error'],
    ...['-f', 'concat', '-safe', '0', '-i', listFile],
    ...['-t', durationSeconds.toFixed(3)],
    ...['-vf', filters.join(',')],
    ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high'],
    ...['-movflags', '+faststart', '-an'],
    output,
  ];
}

/** Scales a frame to the poster size and lays the play badge (raw RGBA, see playBadgePixels) over it. */
export function posterArguments(frameFile: string, badgeFile: string, output: string): string[] {
  return [
    ...['-y', '-loglevel', 'error'],
    ...['-i', frameFile],
    ...['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${POSTER_WIDTH}x${POSTER_HEIGHT}`, '-i', badgeFile],
    ...['-filter_complex', `[0:v]scale=${POSTER_WIDTH}:${POSTER_HEIGHT}:flags=lanczos[frame];[frame][1:v]overlay=format=auto`],
    ...['-frames:v', '1', '-q:v', '5'],
    output,
  ];
}

type Rgba = [number, number, number, number];

/** Premultiplied "source over destination"; the source comes in straight alpha. */
function over(source: Readonly<Rgba>, destination: Rgba): void {
  const [red, green, blue, alpha] = source;
  destination[0] = red * alpha + destination[0] * (1 - alpha);
  destination[1] = green * alpha + destination[1] * (1 - alpha);
  destination[2] = blue * alpha + destination[2] * (1 - alpha);
  destination[3] = alpha + destination[3] * (1 - alpha);
}

type Corner = readonly [number, number];

function insideTriangle(x: number, y: number, [first, second, third]: readonly [Corner, Corner, Corner]): boolean {
  const side = (from: Corner, to: Corner) => (to[0] - from[0]) * (y - from[1]) - (to[1] - from[1]) * (x - from[0]);
  const sides = [side(first, second), side(second, third), side(third, first)];
  return sides.every((value) => value >= 0) || sides.every((value) => value <= 0);
}

/**
 * The poster's play symbol as straight-alpha RGBA pixels: the whole frame dimmed slightly, a dark disc with
 * a white ring in the middle and a white triangle on it. Edges are antialiased by supersampling.
 */
export function playBadgePixels(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const centreX = width / 2;
  const centreY = height / 2;
  const { radius, strokeWidth, samplesPerAxis } = PLAY_BADGE;
  const outerRadius = radius + strokeWidth / 2;
  const [left, tip, bottom] = PLAY_BADGE.triangleCorners.map(([dx, dy]): Corner => [centreX + dx, centreY + dy]);
  if (left === undefined || tip === undefined || bottom === undefined) throw new Error('the play triangle needs three corners');
  const corners = [left, tip, bottom] as const;
  const sampleCount = samplesPerAxis * samplesPerAxis;
  const sum: Rgba = [0, 0, 0, 0];
  const sample: Rgba = [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nearBadge = Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) <= outerRadius + 1;
      const samples = nearBadge ? samplesPerAxis : 1;
      sum.fill(0);
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          sample.fill(0);
          over(PLAY_BADGE.dim, sample);
          if (nearBadge) {
            const distance = Math.hypot(px - centreX, py - centreY);
            if (distance <= radius) over(PLAY_BADGE.disc, sample);
            if (Math.abs(distance - radius) <= strokeWidth / 2) over(PLAY_BADGE.stroke, sample);
            if (insideTriangle(px, py, corners)) over(PLAY_BADGE.triangle, sample);
          }
          sum[0] += sample[0];
          sum[1] += sample[1];
          sum[2] += sample[2];
          sum[3] += sample[3];
        }
      }
      const weight = nearBadge ? sampleCount : 1;
      const alpha = sum[3] / weight;
      const offset = (y * width + x) * 4;
      const straight = (premultiplied: number) => (alpha === 0 ? 0 : Math.round(premultiplied / weight / alpha));
      pixels.set([straight(sum[0]), straight(sum[1]), straight(sum[2]), Math.round(alpha * 255)], offset);
    }
  }
  return pixels;
}
