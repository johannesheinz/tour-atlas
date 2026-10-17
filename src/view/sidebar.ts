import { requireElement } from './dom.ts';

export interface SidebarView {
  setToggleLabel(text: string): void;
  showTab(tab: 'bands' | 'places'): void;
}

/** Tabs between the band and place lists (ARIA tabs with arrow keys) and the collapsible panel on phones. */
export function createSidebar(root: HTMLElement): SidebarView {
  const toggle = requireElement(root, '#sidebar-toggle', HTMLButtonElement);
  const tabs = [requireElement(root, '#tab-bands', HTMLButtonElement), requireElement(root, '#tab-places', HTMLButtonElement)] as const;
  const panels = [requireElement(root, '#band-list', HTMLElement), requireElement(root, '#place-list', HTMLElement)] as const;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    root.classList.toggle('is-expanded', expanded);
  });

  const select = (index: 0 | 1, focus: boolean) => {
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel, position) => {
      panel.hidden = position !== index;
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
  };
}
