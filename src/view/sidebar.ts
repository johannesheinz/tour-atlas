import type { SidebarPanel } from '../selection.ts';
import { requireElement } from './dom.ts';

export type SidebarTab = 'bands' | 'places' | 'genres';

const TABS: readonly SidebarTab[] = ['bands', 'places', 'genres'];
const LIST_IDS: Readonly<Record<SidebarTab, string>> = { bands: '#band-list', places: '#place-list', genres: '#genre-list' };

export interface SidebarView {
  setToggleLabel(text: string): void;
  showTab(tab: SidebarTab): void;
  activeTab(): SidebarTab;
  focusActiveTab(): void;
  /** Shows the band and place lists or drills down into a panel; new content (by key) starts at the top. */
  show(panel: SidebarPanel, contentKey: string): void;
}

/** Tabs between the band and place lists (ARIA tabs with arrow keys), the drill-down panels, and the collapsible panel on phones. */
export function createSidebar(root: HTMLElement): SidebarView {
  const toggle = requireElement(root, '#sidebar-toggle', HTMLButtonElement);
  const scroller = requireElement(root, '#sidebar-body', HTMLElement);
  const tabList = requireElement(root, '.sidebar-tabs', HTMLElement);
  const tabs = TABS.map((tab) => requireElement(root, `#tab-${tab}`, HTMLButtonElement));
  const lists = TABS.map((tab) => requireElement(root, LIST_IDS[tab], HTMLElement));
  const drillDowns = { selection: requireElement(root, '#selection-panel', HTMLElement), previews: requireElement(root, '#preview-panel', HTMLElement) } as const;
  let active = 0;
  let shown: { panel: SidebarPanel; key: string } = { panel: 'lists', key: 'lists' };
  let listScrollTop = 0;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    root.classList.toggle('is-expanded', expanded);
  });

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
    setToggleLabel: (text) => {
      toggle.textContent = text;
    },
    showTab: (tab) => select(TABS.indexOf(tab), false),
    activeTab: () => {
      const tab = TABS[active];
      if (tab === undefined) throw new Error(`no tab at ${active}`);
      return tab;
    },
    focusActiveTab: () => tabs[active]?.focus(),
    show(panel, contentKey) {
      if (panel === shown.panel && contentKey === shown.key) return;
      if (shown.panel === 'lists') listScrollTop = scroller.scrollTop;
      shown = { panel, key: contentKey };
      root.classList.toggle('is-drilled-down', panel !== 'lists');
      tabList.hidden = panel !== 'lists';
      drillDowns.selection.hidden = panel !== 'selection';
      drillDowns.previews.hidden = panel !== 'previews';
      select(active, false);
      scroller.scrollTop = panel === 'lists' ? listScrollTop : 0;
    },
  };
}
