import { createHash } from 'node:crypto';
import { build, type Plugin } from 'vite';
import { SERVICE_WORKER_FILE, type Precache } from '../../src/sw/offlineCache.ts';
import { SOCIAL_CARD_FILE } from './socialCard.ts';

/**
 * Writes sw.js, the service worker that keeps the build for offline use. Its first line lists every file of the
 * build and a hash of their contents, so each deploy changes the worker's bytes, which is how browsers find out
 * about it. Must run after every other plugin has written or changed its files.
 */
const PRECACHE_LINE = /^const PRECACHE = (\{.*\});\n/;

/** Crawlers fetch the social card and browsers never do, so it stays out of the offline copy. */
const NOT_PRECACHED: ReadonlySet<string> = new Set([SOCIAL_CARD_FILE, SERVICE_WORKER_FILE]);

export function precacheOf(files: ReadonlyMap<string, Uint8Array>): Precache {
  const names = [...files.keys()].filter((name) => !NOT_PRECACHED.has(name)).toSorted();
  if (!names.includes('index.html')) throw new Error('service worker: the build has no index.html to keep offline');
  const hash = createHash('sha256');
  for (const name of names) {
    const content = files.get(name);
    if (content === undefined) throw new Error(`service worker: ${name} has no content`);
    hash.update(name).update('\0').update(content).update('\0');
  }
  return { version: hash.digest('hex').slice(0, 16), files: names };
}

export function serviceWorkerSource(precache: Precache, compiledWorker: string): string {
  return `const PRECACHE = ${JSON.stringify(precache)};\n${compiledWorker}`;
}

export function readPrecache(source: string): Precache | null {
  const json = PRECACHE_LINE.exec(source)?.[1];
  if (json === undefined) return null;
  const value: unknown = JSON.parse(json);
  if (typeof value !== 'object' || value === null) return null;
  const { version, files } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !Array.isArray(files) || !files.every((file) => typeof file === 'string')) return null;
  return { version, files };
}

/** What tools/check-dist.ts reports about sw.js; `read` returns a file from dist. */
export function serviceWorkerProblems(files: readonly string[], read: (file: string) => Uint8Array): string[] {
  if (!files.includes(SERVICE_WORKER_FILE)) return [`${SERVICE_WORKER_FILE} is missing; the app would not open offline`];
  const source = new TextDecoder().decode(read(SERVICE_WORKER_FILE));
  const precache = readPrecache(source);
  if (precache === null) return [`${SERVICE_WORKER_FILE} does not start with its precache list`];

  const problems: string[] = [];
  const expected = precacheOf(new Map(files.map((file) => [file, read(file)])));
  const missing = expected.files.filter((file) => !precache.files.includes(file));
  const extra = precache.files.filter((file) => !expected.files.includes(file));
  if (missing.length > 0) problems.push(`${SERVICE_WORKER_FILE} does not keep ${missing.join(', ')} offline`);
  if (extra.length > 0) problems.push(`${SERVICE_WORKER_FILE} lists ${extra.join(', ')}, which dist does not have`);
  if (missing.length === 0 && extra.length === 0 && precache.version !== expected.version) {
    problems.push(`${SERVICE_WORKER_FILE} has version ${precache.version}, but the files hash to ${expected.version}; installed apps would not update`);
  }
  for (const [pattern, description] of WORKER_FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) problems.push(`${SERVICE_WORKER_FILE} contains ${description}`);
  }
  return problems;
}

/** The worker fetches and caches the site's own files and nothing else. */
const WORKER_FORBIDDEN_PATTERNS: readonly [RegExp, string][] = [
  [/(?:https?:)?\/\/[\w-]+\.[\w.-]/i, 'an absolute URL'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bpushManager\b/i, 'push messaging'],
  [/\bsync\.register\b/, 'background sync'],
];

/** Compiles the worker with Vite into one classic script: older Safari and Firefox cannot run module workers. */
async function compileWorker(entry: string, target: string): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      target,
      minify: true,
      copyPublicDir: false,
      emptyOutDir: false,
      reportCompressedSize: false,
      lib: { entry, formats: ['iife'], name: 'tourAtlasServiceWorker', fileName: () => SERVICE_WORKER_FILE },
    },
  });
  const results = Array.isArray(output) ? output : [output];
  const chunks = results.flatMap((result) => ('output' in result ? result.output : [])).filter((file) => file.type === 'chunk');
  const [chunk] = chunks;
  if (chunk === undefined || chunks.length > 1) throw new Error(`service worker: expected one compiled chunk, got ${chunks.length}`);
  return chunk.code;
}

export function serviceWorkerPlugin(entry: string): Plugin {
  let target: string | null = null;
  return {
    name: 'tour-atlas:service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      const configured = config.build.target;
      if (typeof configured !== 'string') throw new Error('service worker: build.target must be one string, so the worker can share it');
      target = configured;
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        if (target === null) throw new Error('service worker: the config was not resolved');
        const files = new Map<string, Uint8Array>();
        for (const output of Object.values(bundle)) {
          const content = output.type === 'chunk' ? output.code : output.source;
          files.set(output.fileName, typeof content === 'string' ? new TextEncoder().encode(content) : content);
        }
        const source = serviceWorkerSource(precacheOf(files), await compileWorker(entry, target));
        this.emitFile({ type: 'asset', fileName: SERVICE_WORKER_FILE, source });
      },
    },
  };
}
