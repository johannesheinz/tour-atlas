import { describe, expect, it } from 'vitest';
import { lineForPath, locateJsonPaths } from '../../tools/shared/jsonLocate.ts';

const text = `{
  "band": { "id": "x" },
  "shows": [
    {
      "date": "17 Oct",
      "geo": {
        "lat": 123
      }
    },
    { "date": "2026-01-01" }
  ]
}
`;

describe('locateJsonPaths', () => {
  const lines = locateJsonPaths(text);

  it('maps validator paths to lines', () => {
    expect(lines.get('band.id')).toBe(2);
    expect(lines.get('shows[0].date')).toBe(5);
    expect(lines.get('shows[0].geo.lat')).toBe(7);
    expect(lines.get('shows[1].date')).toBe(10);
  });

  it('falls back to the closest ancestor', () => {
    expect(lineForPath(lines, 'shows[0].venue')).toBe(4);
    expect(lineForPath(lines, 'shows[1].geo.lat')).toBe(10);
    expect(lineForPath(lines, '')).toBe(1);
  });
});
