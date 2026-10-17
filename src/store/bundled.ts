import type { BandFile } from '../data/types.ts';
import { formatIssue, validateRepository } from '../data/validate.ts';
import { StaticStore } from './StaticStore.ts';

const bundledModules = import.meta.glob<unknown>('@bands/*.json', { eager: true, import: 'default' });

/** The build already validated these files; validating again turns untyped JSON into typed data. */
export function createBundledStore(): StaticStore {
  const errors: string[] = [];
  const bands: BandFile[] = [];
  for (const [path, json] of Object.entries(bundledModules)) {
    const file = path.split('/').at(-1) ?? path;
    const result = validateRepository(json, file);
    if (result.issues.length > 0 || result.value === null) errors.push(...result.issues.map(formatIssue));
    else bands.push(result.value);
  }
  if (errors.length > 0) throw new Error(`Bundled band data is invalid:\n${errors.join('\n')}`);
  return new StaticStore(bands);
}
