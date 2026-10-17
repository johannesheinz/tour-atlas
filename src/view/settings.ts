import type { ThemePreference } from '../model.ts';
import { h } from './dom.ts';
import { attachPopover } from './popover.ts';

export interface SettingsProps {
  readonly theme: ThemePreference;
}

export interface SettingsCallbacks {
  onTheme(theme: ThemePreference): void;
  onPreviewFiles(): void;
  onExportAll(): void;
}

export interface SettingsView {
  render(props: SettingsProps): void;
}

const THEMES: readonly [ThemePreference, string][] = [
  ['auto', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** The settings pop-up behind the masthead's gear: the theme and the band file actions. */
export function createSettings(trigger: HTMLButtonElement, panel: HTMLElement, callbacks: SettingsCallbacks): SettingsView {
  const popover = attachPopover(trigger, panel);

  const themeInputs = THEMES.map(([value, label]) => {
    const input = h('input', { type: 'radio', name: 'theme', value });
    input.addEventListener('change', () => {
      if (input.checked) callbacks.onTheme(value);
    });
    return [value, input, h('label', {}, input, label)] as const;
  });

  const preview = h('button', { type: 'button', class: 'button button-small' }, 'Preview files…');
  const exportAll = h('button', { type: 'button', class: 'button button-small' }, 'Export all');
  preview.addEventListener('click', () => {
    popover.close(false);
    callbacks.onPreviewFiles();
  });
  exportAll.addEventListener('click', () => {
    popover.close(false);
    callbacks.onExportAll();
  });

  panel.append(
    h('h2', { class: 'settings-title' }, 'Settings'),
    h('fieldset', { class: 'settings-section' }, h('legend', {}, 'Theme'), h('div', { class: 'theme-switch' }, ...themeInputs.map(([, , label]) => label))),
    h('div', { class: 'settings-section', role: 'group', 'aria-labelledby': 'settings-files' }, h('h3', { id: 'settings-files' }, 'Band files'), h('div', { class: 'settings-actions' }, preview, exportAll)),
  );

  return {
    render(props) {
      for (const [value, input] of themeInputs) input.checked = props.theme === value;
    },
  };
}
