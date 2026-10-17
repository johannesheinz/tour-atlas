import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { bandDataPlugin } from './tools/vite/bandData.ts';
import { brandPlugin } from './tools/vite/brand.ts';
import { cspPlugin } from './tools/vite/csp.ts';
import { hostedAssetsPlugin } from './tools/vite/hostedAssets.ts';
import { worldTopologyPlugin } from './tools/vite/worldTopology.ts';

const bandsDir = resolve(process.env['TOUR_ATLAS_BANDS_DIR'] ?? 'data/bands');
const outDir = resolve(process.env['TOUR_ATLAS_OUT_DIR'] ?? 'dist');

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@bands': bandsDir },
  },
  plugins: [
    bandDataPlugin(bandsDir),
    brandPlugin(resolve('src/brand/mark.svg'), resolve('src/brand/favicon.svg')),
    worldTopologyPlugin(),
    viteSingleFile({ removeViteModuleLoader: true }),
    hostedAssetsPlugin(),
    cspPlugin(),
  ],
  build: {
    target: 'es2023',
    outDir,
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
});
