import type { SidebarPanel } from '../selection.ts';
import { requireElement } from './dom.ts';
import { focusReturn, stepDrillDowns, type OpenedDrillDown } from './drillDownFocus.ts';

export type SidebarTab = 'bands' | 'places' | 'genres';

const TABS: readonly SidebarTab[] = ['bands', 'places', 'genres'];
const LIST_IDS: Readonly<Record<SidebarTab, string>> = { bands: '#band-list', places: '#place-list', genres: '#genre-list' };

export interface SidebarView {
  showTab(tab: SidebarTab): void;
  activeTab(): SidebarTab;
  /**
   * Shows the band and place lists or drills down into a panel; new content (by key) starts at the top. False when it was shown already.
   * Closing a drill-down that had focus returns focus to what opened it (see focusReturn).
   */
  show(panel: SidebarPanel, contentKey: string): boolean;
}

export interface SidebarFocus {
  /** The bottom sheet's handle, where focus goes on phones when the opener of a drill-down is gone. */
  readonly handle: HTMLButtonElement;
  hasSheet(): boolean;
}

/** A control that opened a drill-down; list rows are found again by their key when a list has drawn them anew. */
interface Opener {
  readonly element: HTMLElement;
  readonly key: string | null;
  readonly scope: HTMLElement | null;
}

const CONTROL_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tabs between the band and place lists (ARIA tabs with arrow keys) and the drill-down panels; on phones src/view/sheet.ts moves it. */
export function createSidebar(root: HTMLElement, focus: SidebarFocus): SidebarView {
  const scroller = requireElement(root, '#sidebar-body', HTMLElement);
  const tabList = requireElement(root, '.sidebar-tabs', HTMLElement);
  const tabs = TABS.map((tab) => requireElement(root, `#tab-${tab}`, HTMLButtonElement));
  const lists = TABS.map((tab) => requireElement(root, LIST_IDS[tab], HTMLElement));
  const drillDowns = { selection: requireElement(root, '#selection-panel', HTMLElement), previews: requireElement(root, '#preview-panel', HTMLElement) } as const;
  let active = 0;
  let shown: { panel: SidebarPanel; key: string } = { panel: 'lists', key: 'lists' };
  let listScrollTop = 0;
  let opened: readonly OpenedDrillDown<Opener>[] = [];
  /** What a click being handled was on: buttons do not take focus when clicked in every browser. */
  let clicked: Element | null = null;
  window.addEventListener(
    'click',
    (event) => {
      clicked = event.target instanceof Element ? event.target : null;
      setTimeout(() => (clicked = null));
    },
    { capture: true },
  );

  const currentOpener = (): Opener | null => {
    const focused = document.activeElement;
    const element = clicked?.closest<HTMLElement>(CONTROL_SELECTOR) ?? (focused instanceof HTMLElement && focused.matches(CONTROL_SELECTOR) ? focused : null);
    if (element === null) return null;
    return { element, key: element.dataset['rowKey'] ?? null, scope: element.parentElement?.closest<HTMLElement>('[id]') ?? null };
  };
  const focusable = (element: HTMLElement | null): element is HTMLElement =>
    element !== null && element.isConnected && element.checkVisibility() && element.closest('[inert]') === null;
  const findOpener = (opener: Opener | null): HTMLElement | null => {
    if (opener === null) return null;
    if (focusable(opener.element)) return opener.element;
    if (opener.key === null || opener.scope === null) return null;
    const again = opener.scope.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(opener.key)}"]`);
    return focusable(again) ? again : null;
  };
  const focusShownPanel = () => {
    if (shown.panel === 'lists') tabs[active]?.focus();
    else drillDowns[shown.panel].querySelector<HTMLElement>(CONTROL_SELECTOR)?.focus();
  };
  /** Once the lists have drawn the new state, which happens after the panel switches. */
  const returnFocus = (opener: Opener | null) =>
    queueMicrotask(() => {
      const element = findOpener(opener);
      const target = focusReturn(element !== null, focus.hasSheet());
      if (target === 'opener') element?.focus();
      else if (target === 'handle') focus.handle.focus();
      else focusShownPanel();
    });
  /** Focus was in the drill-down, or lost and not to a click elsewhere, such as on the map. */
  const focusInDrillDown = (panel: SidebarPanel): boolean => {
    if (panel === 'lists') return false;
    const element = document.activeElement;
    if (element !== null && element !== document.body) return drillDowns[panel].contains(element);
    return clicked === null || drillDowns[panel].contains(clicked);
  };

  const select = (index: number, focus: boolean) => {
    active = index;
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    lists.forEach((list, position) => {
      list.hidden = shown.panel !== 'lists' || position !== index;
    });
    if (focus) tabs[index]?.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index, false));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select((index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
    });
  });

  return {
    showTab: (tab) => select(TABS.indexOf(tab), false),
    activeTab: () => {
      const tab = TABS[active];
      if (tab === undefined) throw new Error(`no tab at ${active}`);
      return tab;
    },
    show(panel, contentKey) {
      if (panel === shown.panel && contentKey === shown.key) return false;
      if (shown.panel === 'lists') listScrollTop = scroller.scrollTop;
      const step = stepDrillDowns(opened, shown.panel, panel, currentOpener());
      opened = step.opened;
      if (step.back !== null && focusInDrillDown(shown.panel)) returnFocus(step.back.opener);
      shown = { panel, key: contentKey };
      tabList.hidden = panel !== 'lists';
      drillDowns.selection.hidden = panel !== 'selection';
      drillDowns.previews.hidden = panel !== 'previews';
      select(active, false);
      scroller.scrollTop = panel === 'lists' ? listScrollTop : 0;
      return true;
    },
  };
}
