import { requireElement } from './dom.ts';

export type SidebarTab = 'bands' | 'places';

export interface SidebarView {
  setToggleLabel(text: string): void;
  showTab(tab: SidebarTab): void;
  activeTab(): SidebarTab;
  focusActiveTab(): void;
  /** Swaps the tabs for the selection panel; a new selection (by key) starts at the top. */
  showSelection(selectionKey: string | null): void;
}

/** Tabs between the band and place lists (ARIA tabs with arrow keys), the selection drill-down, and the collapsible panel on phones. */
export function createSidebar(root: HTMLElement): SidebarView {
  const toggle = requireElement(root, '#sidebar-toggle', HTMLButtonElement);
  const scroller = requireElement(root, '#sidebar-body', HTMLElement);
  const tabList = requireElement(root, '.sidebar-tabs', HTMLElement);
  const tabs = [requireElement(root, '#tab-bands', HTMLButtonElement), requireElement(root, '#tab-places', HTMLButtonElement)] as const;
  const panels = [requireElement(root, '#band-list', HTMLElement), requireElement(root, '#place-list', HTMLElement)] as const;
  const selectionPanel = requireElement(root, '#selection-panel', HTMLElement);
  let active: 0 | 1 = 0;
  let shownSelection: string | null = null;
  let listScrollTop = 0;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    root.classList.toggle('is-expanded', expanded);
  });

  const select = (index: 0 | 1, focus: boolean) => {
    active = index;
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel, position) => {
      panel.hidden = shownSelection !== null || position !== index;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index === 0 ? 0 : 1, false));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select(index === 0 ? 1 : 0, true);
    });
  });

  return {
    setToggleLabel: (text) => {
      toggle.textContent = text;
    },
    showTab: (tab) => select(tab === 'bands' ? 0 : 1, false),
    activeTab: () => (active === 0 ? 'bands' : 'places'),
    focusActiveTab: () => tabs[active].focus(),
    showSelection(selectionKey) {
      if (selectionKey === shownSelection) return;
      const opening = shownSelection === null;
      const closing = selectionKey === null;
      if (opening) listScrollTop = scroller.scrollTop;
      shownSelection = selectionKey;
      root.classList.toggle('is-selecting', !closing);
      tabList.hidden = !closing;
      selectionPanel.hidden = closing;
      select(active, false);
      scroller.scrollTop = closing ? listScrollTop : 0;
    },
  };
}
