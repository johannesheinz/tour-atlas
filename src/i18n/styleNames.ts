import type { Style } from '../data/styles.ts';

/** The styles' names are names, not descriptions, so every language shows them in English. */
export const STYLE_NAMES: Readonly<Record<Style, string>> = {
  stage: 'Stage lights',
  bold: 'Bold contrast',
  soft: 'Soft print',
  atlas: 'Road atlas',
};

export const STYLE_NAMES_LANGUAGE = 'en';
