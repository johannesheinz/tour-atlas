import type { Plugin } from 'vite';

/**
 * vite-plugin-singlefile inlines every asset. Fonts are the exception: they ship as files next to
 * index.html (the inlined CSS resolves url() against the page), so browsers cache them across data
 * updates. Over file:// browsers block them and the CSS falls back to system fonts.
 */
export function hostedFontsPlugin(): Plugin {
  return {
    name: 'tour-atlas:hosted-fonts',
    apply: 'build',
    enforce: 'post',
    config(config) {
      config.build ??= {};
      config.build.assetsDir = '';
      config.build.assetsInlineLimit = (filePath: string) => !filePath.endsWith('.woff2');
    },
  };
}
