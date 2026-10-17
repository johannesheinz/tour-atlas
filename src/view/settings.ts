import type { ThemePreference } from '../model.ts';
import { h } from './dom.ts';
import { attachPopover } from './popover.ts';

export interface SettingsProps {
  readonly theme: ThemePreference;
  readonly followTimeline: boolean;
  readonly hideEmptyLanes: boolean;
  readonly includePastMonth: boolean;
}

export interface SettingsCallbacks {
  onTheme(theme: ThemePreference): void;
  onFollowTimeline(follow: boolean): void;
  onHideEmptyLanes(hide: boolean): void;
  onIncludePastMonth(include: boolean): void;
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

/** The settings pop-up behind the masthead's settings button. */
export function createSettings(trigger: HTMLButtonElement, panel: HTMLElement, callbacks: SettingsCallbacks): SettingsView {
  const popover = attachPopover(trigger, panel);

  const themeInputs = THEMES.map(([value, label]) => {
    const input = h('input', { type: 'radio', name: 'theme', value });
    input.addEventListener('change', () => {
      if (input.checked) callbacks.onTheme(value);
    });
    return [value, input, h('label', {}, input, label)] as const;
  });

  const toggle = (label: string, note: string, onChange: (checked: boolean) => void) => {
    const noteId = `setting-${label.toLowerCase().replaceAll(' ', '-')}`;
    const button = h(
      'button',
      { type: 'button', role: 'switch', class: 'switch', 'aria-checked': 'false', 'aria-describedby': noteId },
      h('span', { class: 'switch-label' }, label),
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    );
    button.addEventListener('click', () => onChange(button.getAttribute('aria-checked') !== 'true'));
    return { button, row: h('div', { class: 'setting' }, button, h('p', { class: 'setting-note', id: noteId }, note)) };
  };
  const follow = toggle('Follow timeline', 'The map shows only the shows in the time range.', callbacks.onFollowTimeline);
  const hideEmpty = toggle('Hide empty lanes', 'Bands without shows in the time range collapse on the timeline.', callbacks.onHideEmptyLanes);
  const pastMonth = toggle('Include last month', 'Upcoming ranges start a month back, to follow a running tour.', callbacks.onIncludePastMonth);

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
    h('div', { class: 'settings-section', role: 'group', 'aria-labelledby': 'settings-timeline' }, h('h3', { id: 'settings-timeline' }, 'Timeline'), follow.row, hideEmpty.row, pastMonth.row),
    h('div', { class: 'settings-section', role: 'group', 'aria-labelledby': 'settings-files' }, h('h3', { id: 'settings-files' }, 'Band files'), h('div', { class: 'settings-actions' }, preview, exportAll)),
  );

  return {
    render(props) {
      for (const [value, input] of themeInputs) input.checked = props.theme === value;
      follow.button.setAttribute('aria-checked', String(props.followTimeline));
      hideEmpty.button.setAttribute('aria-checked', String(props.hideEmptyLanes));
      pastMonth.button.setAttribute('aria-checked', String(props.includePastMonth));
    },
  };
}
