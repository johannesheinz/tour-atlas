/** Pure helpers for tools/feature-clips.ts: which parts of a recording make a clip, cropping, and the encoder command lines. */
import type { ScreencastFrame, ScreenPoint } from './screenRecording.ts';

export const CLIP_FPS = 12;
export const CLIP_SECONDS = { min: 3, max: 7 } as const;
export const CLIP_BUDGET_BYTES = 600_000;
/** img2webp quality, tried from best to worst until a clip fits the budget. */
export const WEBP_QUALITIES: readonly number[] = [90, 80, 70, 60, 50];

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A rectangle of the window in CSS pixels. */
export interface Region extends Size {
  readonly x: number;
  readonly y: number;
}

/** A stretch of the recording that goes into the clip, in epoch seconds like the frame timestamps. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface ClipFrames {
  /** Timestamps count from the start of the clip. */
  readonly frames: readonly ScreencastFrame[];
  readonly duration: number;
}

/**
 * Joins the spans into one clip: each starts with the frame on screen at its start and keeps the frames
 * shown before its end; whatever happened between spans (a page reload, say) is cut out.
 */
export function spliceSpans(frames: readonly ScreencastFrame[], spans: readonly Span[]): ClipFrames {
  if (spans.length === 0) throw new Error('a clip needs at least one span of the recording');
  const clip: ScreencastFrame[] = [];
  let offset = 0;
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    if (span.end <= span.start) throw new Error(`the span from ${span.start} to ${span.end} is empty`);
    if (span.start < previousEnd) throw new Error(`the span from ${span.start} starts before the previous one ended at ${previousEnd}`);
    const onScreen = frames.findLast((frame) => frame.timestamp <= span.start);
    if (onScreen === undefined) throw new Error(`no frame was on screen at ${span.start}; the first is at ${frames[0]?.timestamp ?? 'none'}`);
    clip.push({ file: onScreen.file, timestamp: offset });
    for (const frame of frames) {
      if (frame.timestamp > span.start && frame.timestamp < span.end) clip.push({ file: frame.file, timestamp: offset + frame.timestamp - span.start });
    }
    offset += span.end - span.start;
    previousEnd = span.end;
  }
  return { frames: clip, duration: offset };
}

export function checkClipDuration(name: string, seconds: number): void {
  if (seconds < CLIP_SECONDS.min || seconds > CLIP_SECONDS.max) {
    throw new Error(`the ${name} clip runs ${seconds.toFixed(2)} s; clips must run ${CLIP_SECONDS.min} to ${CLIP_SECONDS.max} s`);
  }
}

function checkRegion(viewport: Size, region: Region): void {
  const values = [region.x, region.y, region.width, region.height];
  if (!values.every(Number.isFinite) || region.width <= 0 || region.height <= 0) throw new RangeError(`crop ${JSON.stringify(region)} is not a rectangle`);
  if (region.x < 0 || region.y < 0 || region.x + region.width > viewport.width || region.y + region.height > viewport.height) {
    throw new RangeError(`crop ${JSON.stringify(region)} reaches outside the ${viewport.width}x${viewport.height} window`);
  }
}

/** The output height for `width`, keeping the region's aspect ratio, rounded to whole pixels. */
export function outputSize(region: Size, width: number): Size {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError(`output width ${width} is not a positive whole number`);
  return { width, height: Math.round((width * region.height) / region.width) };
}

/**
 * Crops `region` and scales it to `width`. The crop is given as shares of the frame, so it fits
 * frames at any device pixel ratio or screencast size.
 */
export function cropScaleFilter(viewport: Size, region: Region, width: number): string {
  checkRegion(viewport, region);
  const share = (value: number, of: number) => Number((value / of).toFixed(6));
  const crop = [
    `w=iw*${share(region.width, viewport.width)}`,
    `h=ih*${share(region.height, viewport.height)}`,
    `x=iw*${share(region.x, viewport.width)}`,
    `y=ih*${share(region.y, viewport.height)}`,
  ].join(':');
  const output = outputSize(region, width);
  return `crop=${crop},scale=${output.width}:${output.height}:flags=lanczos`;
}

/** Resamples the concat list to CLIP_FPS PNG frames, numbered from 0 into `pattern` (for example frames/%04d.png). */
export function pngFrameArguments(listFile: string, durationSeconds: number, filter: string, pattern: string): string[] {
  if (!(durationSeconds > 0)) throw new RangeError(`a clip of ${durationSeconds} s has no frames`);
  return [
    ...['-y', '-loglevel', 'error'],
    ...['-f', 'concat', '-safe', '0', '-i', listFile],
    ...['-t', durationSeconds.toFixed(3)],
    ...['-vf', `fps=${CLIP_FPS},${filter}`],
    ...['-start_number', '0'],
    pattern,
  ];
}

/** Every frame lasts this long; WebP counts whole milliseconds. */
export function frameMilliseconds(): number {
  return Math.round(1000 / CLIP_FPS);
}

/** An animated, endlessly looping lossy WebP of the frames in order. */
export function img2webpArguments(frameFiles: readonly string[], quality: number, output: string): string[] {
  if (frameFiles.length === 0) throw new Error('an animation needs at least one frame');
  if (!(quality >= 0 && quality <= 100)) throw new RangeError(`WebP quality ${quality} is not between 0 and 100`);
  return [...['-loop', '0', '-min_size'], ...['-lossy', '-q', String(quality), '-m', '6', '-d', String(frameMilliseconds())], ...frameFiles, '-o', output];
}

/** The next quality to try after an encode of `bytes`, or null when it fits the budget. */
export function nextQuality(name: string, quality: number, bytes: number, budgetBytes: number): number | null {
  if (bytes <= budgetBytes) return null;
  const index = WEBP_QUALITIES.indexOf(quality);
  if (index === -1) throw new Error(`quality ${quality} is not one of ${WEBP_QUALITIES.join(', ')}`);
  const next = WEBP_QUALITIES[index + 1];
  if (next === undefined) {
    throw new Error(`the ${name} clip is ${bytes} bytes at quality ${quality}, over the ${budgetBytes}-byte budget: shorten it or crop it smaller`);
  }
  return next;
}

/** Points from `from` to `to`, `step` pixels apart, both ends included. */
export function pointsAlong(from: ScreenPoint, to: ScreenPoint, step: number): ScreenPoint[] {
  if (!(step > 0)) throw new RangeError(`step ${step} must be positive`);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(length / step));
  return Array.from({ length: count + 1 }, (_, index) => ({ x: from.x + ((to.x - from.x) * index) / count, y: from.y + ((to.y - from.y) * index) / count }));
}

/** A grid over the region, `step` pixels apart, nearest to `centre` first. */
export function gridAround(region: Region, centre: ScreenPoint, step: number): ScreenPoint[] {
  if (!(step > 0)) throw new RangeError(`step ${step} must be positive`);
  const points: ScreenPoint[] = [];
  for (let y = region.y; y <= region.y + region.height; y += step) {
    for (let x = region.x; x <= region.x + region.width; x += step) points.push({ x, y });
  }
  const distance = (point: ScreenPoint) => Math.hypot(point.x - centre.x, point.y - centre.y);
  return points.sort((first, second) => distance(first) - distance(second));
}
