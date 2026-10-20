import { STYLES, isStyle, type Style } from '../data/styles.ts';
import { formats, t } from '../i18n/index.ts';
import { STYLE_NAMES, STYLE_NAMES_LANGUAGE } from '../i18n/styleNames.ts';
import {
  AUTOMATIC,
  CLOCKS,
  DISTANCE_UNITS,
  LANGUAGES,
  LANGUAGE_NAMES,
  isClock,
  isDistanceUnit,
  isLanguage,
  resolveLocale,
  type Clock,
  type DistanceUnit,
  type HourCycle,
  type Language,
  type LocaleChoice,
} from '../i18n/locale.ts';
import type { ThemePreference } from '../model.ts';
import { h } from './dom.ts';
import { attachPopover } from './popover.ts';

export interface SettingsProps {
  readonly style: Style;
  readonly theme: ThemePreference;
}

export interface SettingsCallbacks {
  onStyle(style: Style): void;
  onTheme(theme: ThemePreference): void;
  /** Null follows the browser. */
  onLanguage(language: Language | null): void;
  onClock(clock: Clock | null): void;
  onDistance(distance: DistanceUnit | null): void;
  onPreviewFiles(): void;
  onExportAll(): void;
}

export interface SettingsView {
  render(props: SettingsProps): void;
}

const THEMES: readonly ThemePreference[] = ['auto', 'light', 'dark'];
const AUTOMATIC_VALUE = 'auto';
const EIGHT_PM = Date.UTC(1970, 0, 1, 20, 0);

/** The settings pop-up behind the masthead's gear: style, theme, language, time format, distances and the band file actions. */
export function createSettings(trigger: HTMLButtonElement, panel: HTMLElement, callbacks: SettingsCallbacks, choice: LocaleChoice, browserLanguages: readonly string[]): SettingsView {
  const popover = attachPopover(trigger, panel);
  const text = t().settings;

  const style = h('select', { class: 'settings-select', id: 'settings-style' }, ...STYLES.map((value) => h('option', { value, lang: STYLE_NAMES_LANGUAGE }, STYLE_NAMES[value])));
  style.addEventListener('change', () => {
    if (!isStyle(style.value)) throw new Error(`The style menu offers an unknown style "${style.value}"`);
    callbacks.onStyle(style.value);
  });

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

  const habitualDistance = resolveLocale({ ...choice, distance: null }, browserLanguages).distance;
  const distance = h(
    'select',
    { class: 'settings-select', id: 'settings-distance' },
    h('option', { value: AUTOMATIC_VALUE }, `${text.automatic} (${text.units[habitualDistance]})`),
    ...DISTANCE_UNITS.map((value) => h('option', { value }, text.units[value])),
  );
  distance.value = choice.distance ?? AUTOMATIC_VALUE;
  distance.addEventListener('change', () => callbacks.onDistance(isDistanceUnit(distance.value) ? distance.value : null));

  const preview = h('button', { type: 'button', class: 'button button-small', 'aria-describedby': 'settings-preview-note' }, text.previewFiles);
  const exportAll = h('button', { type: 'button', class: 'button button-small', 'aria-describedby': 'settings-export-note' }, text.exportAll);
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
      h('label', { for: 'settings-style' }, text.style),
      style,
      h('label', { for: 'settings-language' }, text.language),
      language,
      h('label', { for: 'settings-clock' }, text.timeFormat),
      clock,
      h('label', { for: 'settings-distance' }, text.distance),
      distance,
    ),
    h(
      'div',
      { class: 'settings-section', role: 'group', 'aria-labelledby': 'settings-files' },
      h('h3', { id: 'settings-files' }, text.files),
      h('p', { class: 'setting-note settings-intro' }, text.filesIntro),
      h('div', { class: 'setting' }, preview, h('p', { class: 'setting-note', id: 'settings-preview-note' }, text.previewFilesNote)),
      h('div', { class: 'setting' }, exportAll, h('p', { class: 'setting-note', id: 'settings-export-note' }, text.exportAllNote)),
    ),
  );

  return {
    render(props) {
      style.value = props.style;
      for (const [value, input] of themeInputs) input.checked = props.theme === value;
    },
  };
}
