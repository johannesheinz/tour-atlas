import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { bandDataPlugin } from './tools/vite/bandData.ts';
import { brandPlugin } from './tools/vite/brand.ts';
import { cspPlugin } from './tools/vite/csp.ts';
import { hostedAssetsPlugin } from './tools/vite/hostedAssets.ts';
import { loadOrderPlugin } from './tools/vite/loadOrder.ts';
import { logoSizesPlugin } from './tools/vite/logoSizes.ts';
import { serviceWorkerPlugin } from './tools/vite/serviceWorker.ts';
import { parseSiteUrl, socialCardPlugin } from './tools/vite/socialCard.ts';
import { webAppPlugin } from './tools/vite/webApp.ts';
import { worldTopologyPlugin } from './tools/vite/worldTopology.ts';

const bandsDir = resolve(process.env['TOUR_ATLAS_BANDS_DIR'] ?? 'data/bands');
const outDir = resolve(process.env['TOUR_ATLAS_OUT_DIR'] ?? 'dist');
const siteUrl = parseSiteUrl(process.env['TOUR_ATLAS_SITE_URL']);

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@bands': bandsDir },
  },
  plugins: [
    bandDataPlugin(bandsDir),
    brandPlugin(resolve('src/brand/mark.svg'), resolve('src/brand/favicon.svg')),
    worldTopologyPlugin(),
    logoSizesPlugin(resolve('data/logos')),
    socialCardPlugin(siteUrl, bandsDir, resolve('src/brand/og-card.png')),
    webAppPlugin(resolve('src/brand')),
    viteSingleFile({ removeViteModuleLoader: true }),
    hostedAssetsPlugin(),
    loadOrderPlugin(),
    cspPlugin(),
    serviceWorkerPlugin(resolve('src/sw/serviceWorker.ts')),
  ],
  build: {
    target: 'es2023',
    outDir,
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
});
