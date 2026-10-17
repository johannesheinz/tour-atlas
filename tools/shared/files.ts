import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { asWorldTopology, createCountryLocator, type CountryLocator, type WorldTopology } from '../../src/data/countryLocator.ts';

/** Expands directories to their *.json files (sorted); keeps file arguments as given. */
export function expandInputs(inputs: readonly string[]): string[] {
  if (inputs.length === 0) {
    throw new UsageError('no files or directories given');
  }
  return inputs.flatMap((input) => {
    if (!statSync(input, { throwIfNoEntry: false })) {
      throw new UsageError(`${input} does not exist`);
    }
    if (!statSync(input).isDirectory()) return [input];
    return readdirSync(input)
      .filter((name) => name.endsWith('.json'))
      .toSorted()
      .map((name) => join(input, name));
  });
}

export function displayPath(file: string): string {
  return relative(process.cwd(), file) || file;
}

export function readText(file: string): string {
  return readFileSync(file, 'utf8');
}

export class UsageError extends Error {}

export function loadWorldTopology(): WorldTopology {
  const require = createRequire(import.meta.url);
  return asWorldTopology(JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')));
}

export function loadCountryLocator(): CountryLocator {
  return createCountryLocator(loadWorldTopology());
}

export interface CliArguments {
  readonly positional: readonly string[];
  readonly flags: ReadonlySet<string>;
  readonly options: ReadonlyMap<string, string>;
}

/** Minimal parser: "--flag", "--option value", positional arguments. */
export function parseArguments(argv: readonly string[], knownFlags: readonly string[], knownOptions: readonly string[]): CliArguments {
  const positional: string[] = [];
  const flags = new Set<string>();
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (knownFlags.includes(name)) {
      flags.add(name);
    } else if (knownOptions.includes(name)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`--${name} needs a value`);
      options.set(name, value);
    } else {
      throw new UsageError(`unknown option ${arg}`);
    }
  }
  return { positional, flags, options };
}

export function runCli(usage: string, main: () => Promise<number> | number): void {
  Promise.resolve()
    .then(main)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof UsageError) {
        console.error(`${error.message}\n\n${usage}`);
        process.exitCode = 2;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
}
