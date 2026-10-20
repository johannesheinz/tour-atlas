import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

// The production build never runs Vite's import analysis on virtual modules; the dev server does.
describe('dev server', () => {
  let server: ViteDevServer;

  beforeAll(async () => {
    server = await createServer({
      configFile: 'vite.config.ts',
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves the logo sizes to the module that imports them', async () => {
    const importer = await server.transformRequest('/src/logos.ts');
    expect(importer?.code).toContain('virtual:logo-sizes');
    const sizes = await server.transformRequest('\0virtual:logo-sizes');
    expect(sizes?.code).toMatch(/^export default /);
  });

  it('serves the world topology', async () => {
    const topology = await server.transformRequest('\0virtual:world-topology');
    expect(topology?.code).toMatch(/^export default /);
  });
});
