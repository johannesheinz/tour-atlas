import { describe, expect, it } from 'vitest';
import { focusReturn, stepDrillDowns, type OpenedDrillDown } from '../../src/view/drillDownFocus.ts';

describe('remembering what opened a drill-down', () => {
  it('returns the row a selection was opened from', () => {
    const opened = stepDrillDowns<string>([], 'lists', 'selection', 'band row');
    expect(opened).toEqual({ opened: [{ from: 'lists', opener: 'band row' }], back: null });
    expect(stepDrillDowns(opened.opened, 'selection', 'lists', null)).toEqual({ opened: [], back: { opener: 'band row' } });
  });

  it('keeps the opener while one selection replaces another', () => {
    const opened: OpenedDrillDown<string>[] = [{ from: 'lists', opener: 'place row' }];
    expect(stepDrillDowns(opened, 'selection', 'selection', 'link in the panel')).toEqual({ opened, back: null });
  });

  it('steps back through a selection opened from the previews', () => {
    const toPreviews = stepDrillDowns<string>([], 'lists', 'previews', 'previews button');
    const toSelection = stepDrillDowns(toPreviews.opened, 'previews', 'selection', 'preview card');
    const backToPreviews = stepDrillDowns(toSelection.opened, 'selection', 'previews', null);
    expect(backToPreviews).toEqual({ opened: [{ from: 'lists', opener: 'previews button' }], back: { opener: 'preview card' } });
    expect(stepDrillDowns(backToPreviews.opened, 'previews', 'lists', null)).toEqual({ opened: [], back: { opener: 'previews button' } });
  });

  it('knows no opener when going back to a panel nothing was opened from', () => {
    const opened: OpenedDrillDown<string>[] = [{ from: 'lists', opener: 'band row' }];
    expect(stepDrillDowns(opened, 'selection', 'previews', null)).toEqual({ opened, back: { opener: null } });
  });

  it('remembers a drill-down opened without a control, such as by a pin', () => {
    const opened = stepDrillDowns<string>([], 'lists', 'selection', null);
    expect(stepDrillDowns(opened.opened, 'selection', 'lists', null).back).toEqual({ opener: null });
  });
});

describe('where focus goes when a drill-down closes', () => {
  it('goes back to the opener while it can take focus', () => {
    expect(focusReturn(true, true)).toBe('opener');
    expect(focusReturn(true, false)).toBe('opener');
  });

  it('falls back to the handle on phones and to the panel shown elsewhere', () => {
    expect(focusReturn(false, true)).toBe('handle');
    expect(focusReturn(false, false)).toBe('panel');
  });
});
