import { describe, expect, it } from 'vitest';
import {
  calibrateScreen,
  concatList,
  geoPointAt,
  parseAroundPoint,
  screenPointOf,
  timedFrames,
  type ScreencastFrame,
} from '../../tools/shared/screenRecording.ts';

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
