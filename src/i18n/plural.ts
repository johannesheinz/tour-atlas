/** Plural forms of one phrase; "#" stands for the formatted number. `other` is required, the rest as the language needs. */
export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type Counter = (count: number, forms: PluralForms) => string;

/** Picks the form by the language's plural rules, e.g. French treats 0 like 1. */
export function counter(language: string): Counter {
  const rules = new Intl.PluralRules(language);
  const numbers = new Intl.NumberFormat(language);
  return (count, forms) => (forms[rules.select(count)] ?? forms.other).replaceAll('#', numbers.format(count));
}
