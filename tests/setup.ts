import { useLocale } from '../src/i18n/index.ts';

// Tests expect British English, whatever language the machine runs in.
useLocale({ language: 'en', clock: null }, ['en-GB']);
