import { inflateSync } from 'node:zlib';

/**
 * Turns text into SVG path data from a WOFF (1.0) TrueType font, so a rendered image never depends on
 * the fonts installed where it is made. Covers what the Fontsource Latin files use: glyf outlines
 * (simple and composite), a format 4 cmap and pair kerning from GPOS. No shaping beyond that.
 */
export interface OutlineFont {
  /** Path data with the baseline at y = 0 and the text starting at x = 0, plus its advance width. */
  textPath(text: string, size: number, letterSpacingEm: number): { readonly d: string; readonly width: number };
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly onCurve: boolean;
}

type Contour = readonly Point[];

const WOFF_SIGNATURE = 'wOFF';
const TRUETYPE_FLAVOR = 0x00010000;

export function loadWoffFont(woff: Buffer): OutlineFont {
  const tables = woffTables(woff);
  const table = (tag: string): Buffer => {
    const data = tables.get(tag);
    if (data === undefined) throw new Error(`the font has no ${tag} table`);
    return data;
  };
  const head = table('head');
  const unitsPerEm = head.readUInt16BE(18);
  const longOffsets = head.readInt16BE(50) === 1;
  const glyphCount = table('maxp').readUInt16BE(4);
  const metricCount = table('hhea').readUInt16BE(34);
  const hmtx = table('hmtx');
  const loca = table('loca');
  const glyf = table('glyf');
  const glyphFor = characterMap(table('cmap'));
  const kerning = pairKerning(tables.get('GPOS'));

  const advance = (glyph: number) => hmtx.readUInt16BE(4 * Math.min(glyph, metricCount - 1));
  const glyphRange = (glyph: number): readonly [number, number] => {
    if (glyph >= glyphCount) throw new Error(`glyph ${glyph} is beyond the font's ${glyphCount} glyphs`);
    return longOffsets ? [loca.readUInt32BE(glyph * 4), loca.readUInt32BE(glyph * 4 + 4)] : [loca.readUInt16BE(glyph * 2) * 2, loca.readUInt16BE(glyph * 2 + 2) * 2];
  };

  const contours = (glyph: number): Contour[] => {
    const [start, end] = glyphRange(glyph);
    if (start === end) return [];
    const data = glyf.subarray(start, end);
    const contourCount = data.readInt16BE(0);
    return contourCount >= 0 ? simpleGlyph(data, contourCount) : compositeGlyph(data, contours);
  };

  return {
    textPath(text, size, letterSpacingEm) {
      const scale = size / unitsPerEm;
      const glyphs = [...text].map((character) => {
        const glyph = glyphFor(character.codePointAt(0) ?? Number.NaN);
        if (glyph === 0) throw new Error(`the font has no glyph for "${character}"`);
        return glyph;
      });
      let penX = 0;
      const parts: string[] = [];
      glyphs.forEach((glyph, index) => {
        parts.push(...contours(glyph).map((contour) => contourPath(contour, penX, scale)));
        const next = glyphs[index + 1];
        penX += advance(glyph) + (next === undefined ? 0 : kerning(glyph, next) + letterSpacingEm * unitsPerEm);
      });
      return { d: parts.join(''), width: penX * scale };
    },
  };
}

function woffTables(woff: Buffer): Map<string, Buffer> {
  if (woff.toString('latin1', 0, 4) !== WOFF_SIGNATURE) throw new Error('not a WOFF 1.0 font');
  if (woff.readUInt32BE(4) !== TRUETYPE_FLAVOR) throw new Error('only TrueType-flavoured WOFF fonts are supported');
  const tables = new Map<string, Buffer>();
  for (let index = 0; index < woff.readUInt16BE(12); index++) {
    const entry = 44 + index * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compressedLength = woff.readUInt32BE(entry + 8);
    const length = woff.readUInt32BE(entry + 12);
    const data = woff.subarray(offset, offset + compressedLength);
    tables.set(woff.toString('latin1', entry, entry + 4), compressedLength < length ? inflateSync(data) : data);
  }
  return tables;
}

function characterMap(cmap: Buffer): (codePoint: number) => number {
  for (let index = 0; index < cmap.readUInt16BE(2); index++) {
    const record = 4 + index * 8;
    const platform = cmap.readUInt16BE(record);
    const encoding = cmap.readUInt16BE(record + 2);
    const offset = cmap.readUInt32BE(record + 4);
    const unicode = (platform === 3 && encoding === 1) || platform === 0;
    if (unicode && cmap.readUInt16BE(offset) === 4) return format4(cmap.subarray(offset));
  }
  throw new Error('the font has no Unicode cmap in format 4');
}

function format4(subtable: Buffer): (codePoint: number) => number {
  const segmentCount = subtable.readUInt16BE(6) / 2;
  const endCodes = 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const rangeOffsets = deltas + segmentCount * 2;
  return (codePoint) => {
    for (let segment = 0; segment < segmentCount; segment++) {
      if (subtable.readUInt16BE(endCodes + segment * 2) < codePoint) continue;
      const start = subtable.readUInt16BE(startCodes + segment * 2);
      if (start > codePoint) return 0;
      const delta = subtable.readUInt16BE(deltas + segment * 2);
      const rangeOffsetAt = rangeOffsets + segment * 2;
      const rangeOffset = subtable.readUInt16BE(rangeOffsetAt);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = subtable.readUInt16BE(rangeOffsetAt + rangeOffset + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;

function simpleGlyph(data: Buffer, contourCount: number): Contour[] {
  const ends = Array.from({ length: contourCount }, (_, index) => data.readUInt16BE(10 + index * 2));
  const pointCount = (ends.at(-1) ?? -1) + 1;
  let cursor = 10 + contourCount * 2;
  cursor += 2 + data.readUInt16BE(cursor);
  const flags: number[] = [];
  while (flags.length < pointCount) {
    const flag = data.readUInt8(cursor++);
    flags.push(flag);
    if (flag & REPEAT) for (let repeat = data.readUInt8(cursor++); repeat > 0; repeat--) flags.push(flag);
  }
  const readCoordinates = (short: number, sameOrPositive: number) => {
    let value = 0;
    return flags.map((flag) => {
      if (flag & short) {
        const step = data.readUInt8(cursor++);
        value += flag & sameOrPositive ? step : -step;
      } else if (!(flag & sameOrPositive)) {
        value += data.readInt16BE(cursor);
        cursor += 2;
      }
      return value;
    });
  };
  const xs = readCoordinates(X_SHORT, X_SAME_OR_POSITIVE);
  const ys = readCoordinates(Y_SHORT, Y_SAME_OR_POSITIVE);
  const points = flags.map((flag, index) => ({ x: xs[index] ?? Number.NaN, y: ys[index] ?? Number.NaN, onCurve: (flag & ON_CURVE) !== 0 }));
  return ends.map((end, index) => points.slice(index === 0 ? 0 : (ends[index - 1] ?? 0) + 1, end + 1));
}

const ARGS_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const HAS_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const HAS_X_AND_Y_SCALE = 0x0040;
const HAS_TWO_BY_TWO = 0x0080;

function compositeGlyph(data: Buffer, contoursOf: (glyph: number) => Contour[]): Contour[] {
  const result: Contour[] = [];
  let cursor = 10;
  let flags: number;
  do {
    flags = data.readUInt16BE(cursor);
    const component = data.readUInt16BE(cursor + 2);
    cursor += 4;
    if (!(flags & ARGS_ARE_XY_VALUES)) throw new Error('composite glyphs positioned by point numbers are not supported');
    const dx = flags & ARGS_ARE_WORDS ? data.readInt16BE(cursor) : data.readInt8(cursor);
    const dy = flags & ARGS_ARE_WORDS ? data.readInt16BE(cursor + 2) : data.readInt8(cursor + 1);
    cursor += flags & ARGS_ARE_WORDS ? 4 : 2;
    const f2dot14 = () => {
      const value = data.readInt16BE(cursor) / 16384;
      cursor += 2;
      return value;
    };
    let [a, b, c, d] = [1, 0, 0, 1];
    if (flags & HAS_SCALE) a = d = f2dot14();
    else if (flags & HAS_X_AND_Y_SCALE) [a, d] = [f2dot14(), f2dot14()];
    else if (flags & HAS_TWO_BY_TWO) [a, b, c, d] = [f2dot14(), f2dot14(), f2dot14(), f2dot14()];
    for (const contour of contoursOf(component)) {
      result.push(contour.map((point) => ({ x: a * point.x + c * point.y + dx, y: b * point.x + d * point.y + dy, onCurve: point.onCurve })));
    }
  } while (flags & MORE_COMPONENTS);
  return result;
}

/** A closed quadratic outline; two off-curve points in a row imply an on-curve point between them. */
function contourPath(contour: Contour, originX: number, scale: number): string {
  const first = contour[0];
  const last = contour.at(-1);
  if (first === undefined || last === undefined) return '';
  const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, onCurve: true });
  const start = first.onCurve ? first : last.onCurve ? last : midpoint(last, first);
  const rest = first.onCurve ? contour.slice(1) : last.onCurve ? contour.slice(0, -1) : contour;
  const format = (point: Point) => `${round((originX + point.x) * scale)} ${round(-point.y * scale)}`;
  const commands = [`M${format(start)}`];
  let control: Point | null = null;
  for (const point of [...rest, start]) {
    if (point.onCurve) {
      commands.push(control === null ? `L${format(point)}` : `Q${format(control)} ${format(point)}`);
      control = null;
    } else {
      if (control !== null) commands.push(`Q${format(control)} ${format(midpoint(control, point))}`);
      control = point;
    }
  }
  return `${commands.join('')}Z`;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const PAIR_ADJUSTMENT = 2;
const EXTENSION = 9;
const X_ADVANCE = 0x0004;

/** Kerning from the GPOS lookups behind the "kern" feature; pair adjustment in formats 1 and 2. */
function pairKerning(gpos: Buffer | undefined): (left: number, right: number) => number {
  if (gpos === undefined) return () => 0;
  const featureList = gpos.subarray(gpos.readUInt16BE(6));
  const lookupList = gpos.subarray(gpos.readUInt16BE(8));
  const lookupIndexes = new Set<number>();
  for (let index = 0; index < featureList.readUInt16BE(0); index++) {
    const record = 2 + index * 6;
    if (featureList.toString('latin1', record, record + 4) !== 'kern') continue;
    const feature = featureList.subarray(featureList.readUInt16BE(record + 4));
    for (let lookup = 0; lookup < feature.readUInt16BE(2); lookup++) lookupIndexes.add(feature.readUInt16BE(4 + lookup * 2));
  }
  const subtables = [...lookupIndexes].toSorted((a, b) => a - b).map((lookupIndex) => {
    const lookup = lookupList.subarray(lookupList.readUInt16BE(2 + lookupIndex * 2));
    const type = lookup.readUInt16BE(0);
    return Array.from({ length: lookup.readUInt16BE(4) }, (_, index) => {
      const subtable = lookup.subarray(lookup.readUInt16BE(6 + index * 2));
      if (type !== EXTENSION) return { type, subtable };
      return { type: subtable.readUInt16BE(2), subtable: subtable.subarray(subtable.readUInt32BE(4)) };
    }).filter((entry) => entry.type === PAIR_ADJUSTMENT).map((entry) => entry.subtable);
  });
  return (left, right) => subtables.reduce((sum, lookup) => sum + lookupKerning(lookup, left, right), 0);
}

function lookupKerning(subtables: readonly Buffer[], left: number, right: number): number {
  for (const subtable of subtables) {
    const coverageIndex = coverage(subtable.subarray(subtable.readUInt16BE(2)), left);
    if (coverageIndex === null) continue;
    const firstFormat = subtable.readUInt16BE(4);
    const secondFormat = subtable.readUInt16BE(6);
    const firstSize = valueRecordSize(firstFormat);
    const recordSize = firstSize + valueRecordSize(secondFormat);
    const xAdvance = (at: number) => (firstFormat & X_ADVANCE ? subtable.readInt16BE(at + 2 * bitCount(firstFormat & (X_ADVANCE - 1))) : 0);
    if (subtable.readUInt16BE(0) === 1) {
      const pairSet = subtable.readUInt16BE(10 + coverageIndex * 2);
      for (let pair = 0; pair < subtable.readUInt16BE(pairSet); pair++) {
        const record = pairSet + 2 + pair * (2 + recordSize);
        if (subtable.readUInt16BE(record) === right) return xAdvance(record + 2);
      }
      continue;
    }
    const firstClass = classOf(subtable.subarray(subtable.readUInt16BE(8)), left);
    const secondClass = classOf(subtable.subarray(subtable.readUInt16BE(10)), right);
    const secondClassCount = subtable.readUInt16BE(14);
    return xAdvance(16 + (firstClass * secondClassCount + secondClass) * recordSize);
  }
  return 0;
}

function coverage(table: Buffer, glyph: number): number | null {
  const count = table.readUInt16BE(2);
  if (table.readUInt16BE(0) === 1) {
    for (let index = 0; index < count; index++) if (table.readUInt16BE(4 + index * 2) === glyph) return index;
    return null;
  }
  for (let index = 0; index < count; index++) {
    const range = 4 + index * 6;
    const start = table.readUInt16BE(range);
    if (glyph >= start && glyph <= table.readUInt16BE(range + 2)) return table.readUInt16BE(range + 4) + glyph - start;
  }
  return null;
}

function classOf(table: Buffer, glyph: number): number {
  if (table.readUInt16BE(0) === 1) {
    const start = table.readUInt16BE(2);
    const index = glyph - start;
    return index >= 0 && index < table.readUInt16BE(4) ? table.readUInt16BE(6 + index * 2) : 0;
  }
  for (let index = 0; index < table.readUInt16BE(2); index++) {
    const range = 4 + index * 6;
    if (glyph >= table.readUInt16BE(range) && glyph <= table.readUInt16BE(range + 2)) return table.readUInt16BE(range + 4);
  }
  return 0;
}

function valueRecordSize(format: number): number {
  return 2 * bitCount(format);
}

function bitCount(value: number): number {
  let count = 0;
  for (let rest = value; rest > 0; rest >>= 1) count += rest & 1;
  return count;
}
