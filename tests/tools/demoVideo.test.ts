import { describe, expect, it } from 'vitest';
import {
  calibrateScreen,
  concatList,
  encodeArguments,
  frameAt,
  geoPointAt,
  parseAroundPoint,
  playBadgePixels,
  posterArguments,
  screenPointOf,
  timedFrames,
  totalDuration,
  type ScreencastFrame,
} from '../../tools/shared/demoVideo.ts';

const frames: ScreencastFrame[] = [
  { file: '/tmp/frames/00000.jpg', timestamp: 1000 },
  { file: '/tmp/frames/00001.jpg', timestamp: 1000.04 },
  { file: '/tmp/frames/00002.jpg', timestamp: 1000.5 },
];

describe('timedFrames', () => {
  it('shows each frame until the next and the last one until the recording stopped', () => {
    const durations = timedFrames(frames, 1002).map(({ duration }) => duration);
    expect(durations[0]).toBeCloseTo(0.04);
    expect(durations[1]).toBeCloseTo(0.46);
    expect(durations[2]).toBeCloseTo(1.5);
  });

  it('rejects an empty recording, frames out of order and a stop before the last frame', () => {
    expect(() => timedFrames([], 1002)).toThrow(/no frames/);
    expect(() => timedFrames([frames[1], frames[0]].filter((frame) => frame !== undefined), 1002)).toThrow(/not later/);
    expect(() => timedFrames(frames, 1000.5)).toThrow(/not after its last frame/);
  });
});

describe('totalDuration', () => {
  it('runs from the first frame to the stop', () => {
    expect(totalDuration(frames, 1002)).toBeCloseTo(2);
  });
});

describe('concatList', () => {
  it('lists every frame with its duration and repeats the last file', () => {
    expect(concatList(frames, 1002).split('\n')).toEqual([
      "file '/tmp/frames/00000.jpg'",
      'duration 0.040000',
      "file '/tmp/frames/00001.jpg'",
      'duration 0.460000',
      "file '/tmp/frames/00002.jpg'",
      'duration 1.500000',
      "file '/tmp/frames/00002.jpg'",
      '',
    ]);
  });

  it('escapes single quotes in paths', () => {
    expect(concatList([{ file: "/tmp/it's/0.jpg", timestamp: 1 }], 2)).toContain("file '/tmp/it'\\''s/0.jpg'");
  });
});

describe('frameAt', () => {
  it('picks the frame on screen at a moment', () => {
    expect(frameAt(frames, 1000.3).file).toBe('/tmp/frames/00001.jpg');
    expect(frameAt(frames, 1000.5).file).toBe('/tmp/frames/00002.jpg');
    expect(() => frameAt(frames, 999)).toThrow(/no frame/);
  });
});

describe('parseAroundPoint', () => {
  it('reads latitude and longitude from the hash', () => {
    expect(parseAroundPoint('http://127.0.0.1:4173/#view=europe&around=59.33,-18.07&radius=250km')).toEqual({ lat: 59.33, lon: -18.07 });
  });

  it('throws without a well-formed point', () => {
    expect(() => parseAroundPoint('http://127.0.0.1:4173/#view=europe')).toThrow(/no around/);
    expect(() => parseAroundPoint('http://127.0.0.1:4173/#around=north')).toThrow(/not <lat>,<lon>/);
  });
});

describe('screen calibration', () => {
  const calibration = calibrateScreen(
    { screen: { x: 100, y: 200 }, geo: { lat: 60, lon: 10 } },
    { screen: { x: 300, y: 400 }, geo: { lat: 50, lon: 20 } },
  );

  it('maps longitude to x and latitude to y linearly, in both directions', () => {
    expect(screenPointOf(calibration, { lat: 55, lon: 15 })).toEqual({ x: 200, y: 300 });
    expect(screenPointOf(calibration, { lat: 59.33, lon: 18.07 }).x).toBeCloseTo(261.4);
    expect(screenPointOf(calibration, { lat: 59.33, lon: 18.07 }).y).toBeCloseTo(213.4);
    expect(geoPointAt(calibration, { x: 200, y: 300 })).toEqual({ lat: 55, lon: 15 });
  });

  it('round-trips a point', () => {
    const geo = geoPointAt(calibration, screenPointOf(calibration, { lat: 47.1, lon: 8.4 }));
    expect(geo.lat).toBeCloseTo(47.1);
    expect(geo.lon).toBeCloseTo(8.4);
  });

  it('rejects points in one row or column, or on one meridian or parallel', () => {
    const origin = { screen: { x: 100, y: 200 }, geo: { lat: 60, lon: 10 } };
    expect(() => calibrateScreen(origin, { screen: { x: 100.5, y: 400 }, geo: { lat: 50, lon: 20 } })).toThrow(/at least a pixel/);
    expect(() => calibrateScreen(origin, { screen: { x: 300, y: 400 }, geo: { lat: 60, lon: 20 } })).toThrow(/same longitude or latitude/);
  });
});

describe('encodeArguments', () => {
  it('encodes the frame list as H.264 with a fade in and out', () => {
    expect(encodeArguments('/work/frames.txt', 50.25, '/work/demo.mp4')).toEqual([
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      '/work/frames.txt',
      '-t',
      '50.250',
      '-vf',
      'fps=30,fade=t=in:st=0:d=0.6,fade=t=out:st=49.350:d=0.85,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-profile:v',
      'high',
      '-movflags',
      '+faststart',
      '-an',
      '/work/demo.mp4',
    ]);
  });

  it('refuses a recording too short for both fades', () => {
    expect(() => encodeArguments('/work/frames.txt', 1.4, '/work/demo.mp4')).toThrow(/too short/);
  });
});

describe('posterArguments', () => {
  it('scales the frame to 1280x720 and overlays the raw RGBA badge', () => {
    const args = posterArguments('/work/frames/00420.jpg', '/work/badge.rgba', '/work/poster.jpg');
    expect(args.slice(args.indexOf('-f'), args.indexOf('-f') + 7)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1280x720', '-i']);
    expect(args).toContain('[0:v]scale=1280:720:flags=lanczos[frame];[frame][1:v]overlay=format=auto');
    expect(args.at(-1)).toBe('/work/poster.jpg');
  });
});

describe('playBadgePixels', () => {
  const width = 400;
  const height = 300;
  const pixels = playBadgePixels(width, height);
  const at = (x: number, y: number) => Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));

  it('dims the whole frame slightly', () => {
    expect(pixels.length).toBe(width * height * 4);
    expect(at(0, 0)).toEqual([0, 0, 0, 46]);
  });

  it('draws a white triangle on a dark disc with a white ring', () => {
    expect(at(width / 2, height / 2)).toEqual([255, 255, 255, 255]);
    const disc = at(width / 2 - 40, height / 2);
    expect(disc.slice(0, 3)).toEqual([10, 12, 20].map((channel) => Math.round((channel * 0.78) / (0.78 + 0.18 * 0.22))));
    expect(disc[3]).toBe(Math.round((0.78 + 0.18 * 0.22) * 255));
    const ring = at(width / 2, height / 2 - 64);
    expect(ring.slice(0, 3).every((channel) => channel > 200)).toBe(true);
  });
});
