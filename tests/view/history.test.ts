import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../src/appState.ts';
import { HOME_ENTRY, asDrillDownEntry, drillDownEntry, historyStep, isHomeEntry } from '../../src/drillDownHistory.ts';
import { selectionFromUrl, sidebarPanel } from '../../src/selection.ts';

describe('drill-down history', () => {
  it('adds one entry when a list opens and steps back over it when the app closes it', () => {
    expect(historyStep('lists', 'selection', false)).toBe('push');
    expect(historyStep('lists', 'previews', false)).toBe('push');
    expect(historyStep('selection', 'selection', true)).toBe('none');
    expect(historyStep('selection', 'previews', true)).toBe('replace');
    expect(historyStep('selection', 'lists', true)).toBe('back');
  });

  it('does not step back past an entry it did not add, such as the first page of a shared link', () => {
    expect(historyStep('selection', 'lists', false)).toBe('none');
  });

  it('recognises only its own history entries', () => {
    expect(asDrillDownEntry(drillDownEntry('previews'))).toEqual({ drillDown: true, previews: true });
    expect(asDrillDownEntry({ drillDown: true })).toEqual({ drillDown: true, previews: false });
    expect(asDrillDownEntry(null)).toBeNull();
    expect(asDrillDownEntry({ other: 'app' })).toBeNull();
    expect(() => drillDownEntry('lists')).toThrow();
  });

  it('marks the entry the home link adds, and only that one', () => {
    expect(isHomeEntry(HOME_ENTRY)).toBe(true);
    expect(isHomeEntry(drillDownEntry('selection'))).toBe(false);
    expect(isHomeEntry(null)).toBe(false);
  });
});

describe('selectionFromUrl and sidebarPanel', () => {
  const none = { selectedPlaces: [], selectedBandIds: [], selectedShowIds: [] };

  it('restores places before bands before shows and ignores unknown bands', () => {
    const known = new Set(['alpha']);
    expect(selectionFromUrl({ ...none, selectedPlaces: ['de.berlin'], selectedBandIds: ['alpha'] }, known)).toEqual({ kind: 'places', places: new Set(['de.berlin']) });
    expect(selectionFromUrl({ ...none, selectedBandIds: ['alpha', 'gone'], selectedShowIds: ['x'] }, known)).toEqual({ kind: 'bands', bandIds: new Set(['alpha']) });
    expect(selectionFromUrl({ ...none, selectedBandIds: ['gone'], selectedShowIds: ['x'] }, known)).toEqual({ kind: 'shows', showIds: new Set(['x']) });
    expect(selectionFromUrl(none, known)).toEqual(NO_SELECTION);
  });

  it('shows a selection before open previews, and previews only while there are some', () => {
    expect(sidebarPanel({ selection: { kind: 'bands', bandIds: new Set(['alpha']) }, previewsOpen: true, previewResults: [] })).toBe('selection');
    expect(sidebarPanel({ selection: NO_SELECTION, previewsOpen: true, previewResults: [] })).toBe('lists');
  });
});
