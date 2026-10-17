import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import { pinTooltip, showTooltip } from '../../src/view/tooltipContent.ts';
import { makeFile, makeShow } from '../helpers.ts';

const today = '2026-11-03';
const [alpha, beta] = buildBandEntries(
  [
    makeFile([makeShow({ id: 'alpha-2026-11-02-berlin' }), makeShow({ id: 'alpha-2026-11-05-berlin', date: '2026-11-05', status: 'soldout' })], 'alpha') as BandFile,
    makeFile([makeShow({ id: 'beta-2026-11-09-berlin', date: '2026-11-09', venue: null, startTime: null })], 'beta') as BandFile,
  ],
  [],
);
if (alpha === undefined || beta === undefined) throw new Error('fixture bands missing');
const alphaShows = showRefs(alpha, today);
const betaShows = showRefs(beta, today);

describe('tooltips', () => {
  it('describes a single show', () => {
    const [ref] = betaShows;
    if (ref === undefined) throw new Error('no show');
    expect(showTooltip(ref, 'light')).toEqual({
      band: { id: 'beta', name: 'Test Band' },
      title: null,
      lines: [{ color: beta.color.light, text: '9 Nov 2026', detail: 'Berlin, Germany' }],
      more: null,
    });
  });

  it('lists the shows of one band at a pin with their status', () => {
    const content = pinTooltip(alphaShows, 'Berlin', 'dark');
    expect(content.band).toEqual({ id: 'alpha', name: 'Test Band' });
    expect(content.title).toBe('2 shows in Berlin');
    expect(content.lines.map((line) => line.text)).toEqual(['2 Nov 2026, 20:00 (played)', '5 Nov 2026, 20:00 (sold out)']);
    expect(content.lines[0]?.color).toBe(alpha.color.dark);
  });

  it('summarises a mixed pin by band, biggest first', () => {
    const content = pinTooltip([...alphaShows, ...betaShows], 'Berlin +1', 'light');
    expect(content.band).toBeNull();
    expect(content.title).toBe('3 shows in Berlin +1');
    expect(content.lines.map((line) => line.detail)).toEqual(['2 shows, next 5 Nov 2026', '1 show, next 9 Nov 2026']);
    expect(content.more).toBeNull();
  });
});
