import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { localToday } from '../../src/data/dates.ts';
import { formatIssue } from '../../src/data/validate.ts';
import { checkBandFiles } from '../lib/bandFiles.ts';
import { expandInputs } from '../lib/files.ts';

/** Validates every band file before the bundle is built; invalid data fails the build. */
export function bandDataPlugin(bandsDir: string): Plugin {
  const directory = resolve(bandsDir);

  const collectErrors = (): string[] => {
    if (!existsSync(directory)) throw new Error(`band data directory ${directory} does not exist`);
    const files = expandInputs([directory]);
    const checked = checkBandFiles(files, { mode: 'repository', today: localToday(new Date()), locateCountry: null });
    return checked.flatMap((entry) => entry.errors.map(formatIssue));
  };

  return {
    name: 'tour-atlas:band-data',
    buildStart() {
      const errors = collectErrors();
      if (errors.length > 0) {
        this.error(`Invalid band data (${errors.length} errors). Run "npm run validate" for details.\n${errors.join('\n')}`);
      }
    },
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(directory) || !file.endsWith('.json')) return;
      const errors = collectErrors();
      if (errors.length > 0) {
        server.ws.send({ type: 'error', err: { message: `Invalid band data\n${errors.join('\n')}`, stack: '' } });
      }
    },
  };
}
