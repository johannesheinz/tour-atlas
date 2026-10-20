/** The page's visual styles. Each has a light and a dark variant; src/styles.css defines their tokens. */
export const STYLES = ['stage', 'bold', 'soft', 'atlas'] as const;
export type Style = (typeof STYLES)[number];

export const DEFAULT_STYLE: Style = 'stage';

export function isStyle(value: string): value is Style {
  return STYLES.some((style) => style === value);
}

/**
 * The Fontsource families whose files a style downloads. Browsers fetch only the fonts the page uses,
 * so the transfer budget counts the heaviest single style; every hosted font must belong to one.
 */
export const STYLE_FONT_FAMILIES: Readonly<Record<Style, readonly string[]>> = {
  stage: ['inter-tight'],
  bold: ['archivo', 'league-gothic'],
  soft: ['archivo', 'league-gothic'],
  atlas: ['archivo', 'charis-sil'],
};
