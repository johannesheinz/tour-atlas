/** Pure helpers for the screen recordings in tools/feature-clips.ts: screencast timing and map calibration. */

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
