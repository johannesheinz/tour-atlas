import type { Plugin } from 'vite';

/**
 * vite-plugin-singlefile inlines every asset. Fonts and band logos are the exception: they ship as
 * files next to index.html (inlined CSS and JS resolve them against the page), so browsers cache them
 * across data updates and logos load only when shown.
 */
export const HOSTED_ASSET = /\.(woff2|webp)$/;

export function hostedAssetsPlugin(): Plugin {
  return {
    name: 'tour-atlas:hosted-assets',
    apply: 'build',
    enforce: 'post',
    config(config) {
      config.build ??= {};
      config.build.assetsDir = '';
      config.build.assetsInlineLimit = (filePath: string) => !HOSTED_ASSET.test(filePath);
    },
  };
}
