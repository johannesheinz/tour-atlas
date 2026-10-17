import type { SidebarPanel } from './selection.ts';

/** history.state of the entry a drill-down added, so browser Back returns to the band and place lists. */
export interface DrillDownEntry {
  readonly drillDown: true;
  readonly previews: boolean;
}

export type HistoryStep = 'push' | 'replace' | 'back' | 'none';

export function drillDownEntry(panel: SidebarPanel): DrillDownEntry {
  if (panel === 'lists') throw new Error('the lists are not a drill-down');
  return { drillDown: true, previews: panel === 'previews' };
}

export function asDrillDownEntry(value: unknown): DrillDownEntry | null {
  if (typeof value !== 'object' || value === null || !('drillDown' in value) || value.drillDown !== true) return null;
  return { drillDown: true, previews: 'previews' in value && value.previews === true };
}

/**
 * Opening a drill-down from the lists adds one history entry; switching between drill-downs replaces it;
 * closing one in the app steps back over the entry it added, so the app and the browser's Back agree.
 */
export function historyStep(previous: SidebarPanel, current: SidebarPanel, onDrillDownEntry: boolean): HistoryStep {
  if (previous === current) return 'none';
  if (previous === 'lists') return 'push';
  if (current !== 'lists') return 'replace';
  return onDrillDownEntry ? 'back' : 'none';
}
