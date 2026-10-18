import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeBandFile } from '../src/data/normalize.ts';
import { syntheticBands } from './fixtures/synthetic.ts';
import { parseArguments, runCli } from './shared/files.ts';

const USAGE = `Usage: node tools/budget.ts [--bands <n>] [--shows-per-band <n>]

Builds the app with a synthetic dataset (default 50 bands x 100 shows) into .cache/budget/
and runs the dist checks against it, including the 650 kB gzipped budget.`;

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), [], ['bands', 'shows-per-band']);
  const bandCount = Number(args.options.get('bands') ?? '50');
  const showsPerBand = Number(args.options.get('shows-per-band') ?? '100');
  const root = join('.cache', 'budget');
  const bandsDir = join(root, 'bands');
  const outDir = join(root, 'dist');

  rmSync(root, { recursive: true, force: true });
  mkdirSync(bandsDir, { recursive: true });
  for (const file of syntheticBands(bandCount, showsPerBand)) {
    writeFileSync(join(bandsDir, `${file.band.id}.json`), serializeBandFile(file));
  }
  console.log(`Generated ${bandCount} bands x ${showsPerBand} shows in ${bandsDir}`);

  const env = { ...process.env, TOUR_ATLAS_BANDS_DIR: bandsDir, TOUR_ATLAS_OUT_DIR: outDir };
  const build = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { stdio: 'inherit', env });
  if (build.status !== 0) return build.status ?? 1;
  const check = spawnSync(process.execPath, ['tools/check-dist.ts', outDir], { stdio: 'inherit' });
  return check.status ?? 1;
});
