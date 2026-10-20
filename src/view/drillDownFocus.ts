import type { SidebarPanel } from '../selection.ts';

/** How far each panel lies from the lists: the previews open from the lists, a selection from either. */
const PANEL_DEPTH: Readonly<Record<SidebarPanel, number>> = { lists: 0, previews: 1, selection: 2 };

/** A drill-down opened from `from`; `opener` is what had focus or was clicked to open it, or null. */
export interface OpenedDrillDown<T> {
  readonly from: SidebarPanel;
  readonly opener: T | null;
}

export interface DrillDownStep<T> {
  readonly opened: readonly OpenedDrillDown<T>[];
  /** Null when this step opened or switched a drill-down; else the panel it went back to and its opener, if known. */
  readonly back: { readonly opener: T | null } | null;
}

/**
 * Keeps the openers of the drill-downs on the way down from the lists. Going deeper remembers the opener; going
 * back returns the opener of the drill-down left, when it was opened from the panel now shown.
 */
export function stepDrillDowns<T>(opened: readonly OpenedDrillDown<T>[], previous: SidebarPanel, next: SidebarPanel, opener: T | null): DrillDownStep<T> {
  const depth = PANEL_DEPTH[next];
  if (depth > PANEL_DEPTH[previous]) return { opened: [...opened, { from: previous, opener }], back: null };
  if (depth === PANEL_DEPTH[previous]) return { opened, back: null };
  const kept = opened.filter((entry) => PANEL_DEPTH[entry.from] < depth);
  const returnedFrom = opened.findLast((entry) => entry.from === next);
  return { opened: kept, back: { opener: returnedFrom?.opener ?? null } };
}

/** Where focus goes when a drill-down closes: back to its opener while it can take focus; else to the sheet's handle on phones or the panel shown. */
export type FocusReturn = 'opener' | 'handle' | 'panel';

export function focusReturn(openerCanFocus: boolean, hasSheet: boolean): FocusReturn {
  if (openerCanFocus) return 'opener';
  return hasSheet ? 'handle' : 'panel';
}
