import { describe, expect, it } from 'vitest';
import {
  CLIP_BUDGET_BYTES,
  checkClipDuration,
  cropScaleFilter,
  frameMilliseconds,
  gridAround,
  img2webpArguments,
  nextQuality,
  outputSize,
  pngFrameArguments,
  pointsAlong,
  spliceSpans,
  WEBP_QUALITIES,
} from '../../tools/shared/featureClips.ts';
import type { ScreencastFrame } from '../../tools/shared/demoVideo.ts';

const frames: ScreencastFrame[] = [
  { file: 'a.jpg', timestamp: 100 },
  { file: 'b.jpg', timestamp: 101 },
  { file: 'c.jpg', timestamp: 102.5 },
  { file: 'd.jpg', timestamp: 104 },
  { file: 'e.jpg', timestamp: 106 },
];

describe('spliceSpans', () => {
  it('starts with the frame on screen and keeps the frames shown before the end', () => {
    const clip = spliceSpans(frames, [{ start: 100.5, end: 103 }]);
    expect(clip.frames).toEqual([
      { file: 'a.jpg', timestamp: 0 },
      { file: 'b.jpg', timestamp: 0.5 },
      { file: 'c.jpg', timestamp: 2 },
    ]);
    expect(clip.duration).toBeCloseTo(2.5);
  });

  it('cuts out what happened between spans and continues the timeline', () => {
    const clip = spliceSpans(frames, [
      { start: 100, end: 101.5 },
      { start: 104.5, end: 107 },
    ]);
    expect(clip.frames.map(({ file }) => file)).toEqual(['a.jpg', 'b.jpg', 'd.jpg', 'e.jpg']);
    expect(clip.frames.map(({ timestamp }) => timestamp)).toEqual([0, 1, 1.5, 3]);
    expect(clip.duration).toBeCloseTo(4);
  });

  it('does not repeat a frame shown exactly at the start', () => {
    expect(spliceSpans(frames, [{ start: 101, end: 102 }]).frames).toEqual([{ file: 'b.jpg', timestamp: 0 }]);
  });

  it('rejects no spans, empty or overlapping spans and a start before the first frame', () => {
    expect(() => spliceSpans(frames, [])).toThrow(/at least one span/);
    expect(() => spliceSpans(frames, [{ start: 102, end: 102 }])).toThrow(/empty/);
    expect(() => spliceSpans(frames, [{ start: 101, end: 103 }, { start: 102, end: 104 }])).toThrow(/before the previous one ended/);
    expect(() => spliceSpans(frames, [{ start: 99, end: 101 }])).toThrow(/no frame was on screen/);
  });
});

describe('checkClipDuration', () => {
  it('accepts 3 to 7 seconds and names the clip otherwise', () => {
    expect(() => checkClipDuration('share', 3)).not.toThrow();
    expect(() => checkClipDuration('share', 7)).not.toThrow();
    expect(() => checkClipDuration('share', 2.99)).toThrow(/share clip runs 2\.99 s/);
    expect(() => checkClipDuration('share', 7.4)).toThrow(/3 to 7 s/);
  });
});

describe('outputSize', () => {
  it('keeps the aspect ratio at the given width', () => {
    expect(outputSize({ width: 1280, height: 800 }, 640)).toEqual({ width: 640, height: 400 });
    expect(outputSize({ width: 390, height: 844 }, 300)).toEqual({ width: 300, height: 649 });
  });

  it('rejects a width that is not a positive whole number', () => {
    expect(() => outputSize({ width: 100, height: 100 }, 0)).toThrow(RangeError);
    expect(() => outputSize({ width: 100, height: 100 }, 12.5)).toThrow(RangeError);
  });
});

describe('cropScaleFilter', () => {
  const viewport = { width: 1280, height: 800 };

  it('crops by shares of the frame, so any device pixel ratio fits, and scales to the width', () => {
    expect(cropScaleFilter(viewport, { x: 640, y: 0, width: 640, height: 400 }, 640)).toBe('crop=w=iw*0.5:h=ih*0.5:x=iw*0.5:y=ih*0,scale=640:400:flags=lanczos');
  });

  it('keeps the whole window when the region is the window', () => {
    expect(cropScaleFilter(viewport, { x: 0, y: 0, ...viewport }, 640)).toBe('crop=w=iw*1:h=ih*1:x=iw*0:y=ih*0,scale=640:400:flags=lanczos');
  });

  it('rejects regions outside the window or without area', () => {
    expect(() => cropScaleFilter(viewport, { x: 700, y: 0, width: 640, height: 400 }, 640)).toThrow(/outside the 1280x800 window/);
    expect(() => cropScaleFilter(viewport, { x: 0, y: -1, width: 640, height: 400 }, 640)).toThrow(/outside/);
    expect(() => cropScaleFilter(viewport, { x: 0, y: 0, width: 0, height: 400 }, 640)).toThrow(/not a rectangle/);
  });
});

describe('pngFrameArguments', () => {
  it('resamples the concat list to 12 fps PNG frames numbered from 0', () => {
    expect(pngFrameArguments('/work/frames.txt', 5.25, 'crop=w=iw*1:h=ih*1:x=iw*0:y=ih*0,scale=640:400:flags=lanczos', '/work/png/%04d.png')).toEqual([
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
      '5.250',
      '-vf',
      'fps=12,crop=w=iw*1:h=ih*1:x=iw*0:y=ih*0,scale=640:400:flags=lanczos',
      '-start_number',
      '0',
      '/work/png/%04d.png',
    ]);
  });

  it('rejects a clip without duration', () => {
    expect(() => pngFrameArguments('/work/frames.txt', 0, 'scale=640:400', '/work/png/%04d.png')).toThrow(/no frames/);
  });
});

describe('img2webpArguments', () => {
  it('builds an endlessly looping lossy animation with one frame duration for all frames', () => {
    expect(frameMilliseconds()).toBe(83);
    expect(img2webpArguments(['/png/0000.png', '/png/0001.png'], 80, '/work/clip.webp')).toEqual([
      '-loop',
      '0',
      '-min_size',
      '-lossy',
      '-q',
      '80',
      '-m',
      '6',
      '-d',
      '83',
      '/png/0000.png',
      '/png/0001.png',
      '-o',
      '/work/clip.webp',
    ]);
  });

  it('rejects no frames and qualities outside 0 to 100', () => {
    expect(() => img2webpArguments([], 80, '/work/clip.webp')).toThrow(/at least one frame/);
    expect(() => img2webpArguments(['/png/0000.png'], 101, '/work/clip.webp')).toThrow(RangeError);
  });
});

describe('nextQuality', () => {
  it('stops once the clip fits the budget and steps down otherwise', () => {
    const [best, second] = WEBP_QUALITIES;
    if (best === undefined || second === undefined) throw new Error('the quality ladder needs two steps');
    expect(nextQuality('share', best, CLIP_BUDGET_BYTES, CLIP_BUDGET_BYTES)).toBeNull();
    expect(nextQuality('share', best, CLIP_BUDGET_BYTES + 1, CLIP_BUDGET_BYTES)).toBe(second);
  });

  it('throws with advice when even the lowest quality is too large, and for unknown qualities', () => {
    const lowest = WEBP_QUALITIES.at(-1);
    if (lowest === undefined) throw new Error('the quality ladder is empty');
    expect(() => nextQuality('mobile', lowest, 700_000, 600_000)).toThrow(/mobile clip is 700000 bytes .* shorten it or crop it smaller/);
    expect(() => nextQuality('mobile', 55, 700_000, 600_000)).toThrow(/not one of/);
  });
});

describe('pointsAlong', () => {
  it('includes both ends and spaces the points at most a step apart', () => {
    expect(pointsAlong({ x: 0, y: 10 }, { x: 10, y: 10 }, 4)).toEqual([
      { x: 0, y: 10 },
      { x: 10 / 3, y: 10 },
      { x: 20 / 3, y: 10 },
      { x: 10, y: 10 },
    ]);
  });

  it('returns both ends for a single point and rejects a step that is not positive', () => {
    expect(pointsAlong({ x: 5, y: 5 }, { x: 5, y: 5 }, 3)).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(() => pointsAlong({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow(RangeError);
  });
});

describe('gridAround', () => {
  it('covers the region and orders the points nearest the centre first', () => {
    const points = gridAround({ x: 0, y: 0, width: 8, height: 4 }, { x: 8, y: 4 }, 4);
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 8, y: 4 });
    expect(points.at(-1)).toEqual({ x: 0, y: 0 });
  });
});
