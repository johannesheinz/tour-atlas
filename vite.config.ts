import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { bandDataPlugin } from './tools/vite/bandData.ts';
import { cspPlugin } from './tools/vite/csp.ts';
import { hostedFontsPlugin } from './tools/vite/hostedFonts.ts';
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
    worldTopologyPlugin(),
    viteSingleFile({ removeViteModuleLoader: true }),
    hostedFontsPlugin(),
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
