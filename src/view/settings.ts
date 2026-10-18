import { formats, t } from '../i18n/index.ts';
import { AUTOMATIC, CLOCKS, LANGUAGES, LANGUAGE_NAMES, isClock, isLanguage, resolveLocale, type Clock, type HourCycle, type Language, type LocaleChoice } from '../i18n/locale.ts';
import type { ThemePreference } from '../model.ts';
import { h } from './dom.ts';
import { attachPopover } from './popover.ts';

export interface SettingsProps {
  readonly theme: ThemePreference;
}

export interface SettingsCallbacks {
  onTheme(theme: ThemePreference): void;
  /** Null follows the browser. */
  onLanguage(language: Language | null): void;
  onClock(clock: Clock | null): void;
  onPreviewFiles(): void;
  onExportAll(): void;
}

export interface SettingsView {
  render(props: SettingsProps): void;
}

const THEMES: readonly ThemePreference[] = ['auto', 'light', 'dark'];
const AUTOMATIC_VALUE = 'auto';
const EIGHT_PM = Date.UTC(1970, 0, 1, 20, 0);

/** The settings pop-up behind the masthead's gear: theme, language, time format and the band file actions. */
export function createSettings(trigger: HTMLButtonElement, panel: HTMLElement, callbacks: SettingsCallbacks, choice: LocaleChoice, browserLanguages: readonly string[]): SettingsView {
  const popover = attachPopover(trigger, panel);
  const text = t().settings;

  const themeInputs = THEMES.map((value) => {
    const input = h('input', { type: 'radio', name: 'theme', value });
    input.addEventListener('change', () => {
      if (input.checked) callbacks.onTheme(value);
    });
    return [value, input, h('label', {}, input, text.themes[value])] as const;
  });

  const browserLanguage = LANGUAGE_NAMES[resolveLocale(AUTOMATIC, browserLanguages).language];
  const language = h(
    'select',
    { class: 'settings-select', id: 'settings-language' },
    h('option', { value: AUTOMATIC_VALUE }, `${text.automatic} (${browserLanguage})`),
    ...LANGUAGES.map((value) => h('option', { value, lang: value }, LANGUAGE_NAMES[value])),
  );
  language.value = choice.language ?? AUTOMATIC_VALUE;
  language.addEventListener('change', () => callbacks.onLanguage(isLanguage(language.value) ? language.value : null));

  const example = (hourCycle: HourCycle | undefined) => formats().timeOnClock(hourCycle).format(EIGHT_PM);
  const clock = h(
    'select',
    { class: 'settings-select', id: 'settings-clock' },
    h('option', { value: AUTOMATIC_VALUE }, `${text.automatic} (${example(undefined)})`),
    ...CLOCKS.map((value) => h('option', { value }, `${value === '12' ? text.clock12 : text.clock24} (${example(value === '12' ? 'h12' : 'h23')})`)),
  );
  clock.value = choice.clock ?? AUTOMATIC_VALUE;
  clock.addEventListener('change', () => callbacks.onClock(isClock(clock.value) ? clock.value : null));

  const preview = h('button', { type: 'button', class: 'button button-small' }, text.previewFiles);
  const exportAll = h('button', { type: 'button', class: 'button button-small' }, text.exportAll);
  preview.addEventListener('click', () => {
    popover.close(false);
    callbacks.onPreviewFiles();
  });
  exportAll.addEventListener('click', () => {
    popover.close(false);
    callbacks.onExportAll();
  });

  panel.append(
    h('h2', { class: 'settings-title' }, text.title),
    h('fieldset', { class: 'settings-section' }, h('legend', {}, text.theme), h('div', { class: 'theme-switch' }, ...themeInputs.map(([, , label]) => label))),
    h(
      'div',
      { class: 'settings-section settings-fields' },
      h('label', { for: 'settings-language' }, text.language),
      language,
      h('label', { for: 'settings-clock' }, text.timeFormat),
      clock,
    ),
    h('div', { class: 'settings-section', role: 'group', 'aria-labelledby': 'settings-files' }, h('h3', { id: 'settings-files' }, text.files), h('div', { class: 'settings-actions' }, preview, exportAll)),
  );

  return {
    render(props) {
      for (const [value, input] of themeInputs) input.checked = props.theme === value;
    },
  };
}
