import type { Plugin } from 'vite';

/**
 * vite-plugin-singlefile leaves the inlined script in <head> and the stylesheet after it, so the page shows
 * nothing until the whole script has arrived. This puts the stylesheet first in <head>, so nothing paints
 * unstyled, and the module script (deferred either way) last in <body>, so the header and the loading note
 * show while it downloads. Content stays byte for byte, so the CSP hashes do not depend on this step.
 */
export function loadOrderPlugin(): Plugin {
  return {
    name: 'tour-atlas:load-order',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;
          const html = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source);
          output.source = orderForLoading(html);
        }
      },
    },
  };
}

const INLINE_STYLE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const INLINE_SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

export function orderForLoading(html: string): string {
  const style = onlyMatch(html, INLINE_STYLE, 'inline <style>');
  const script = onlyMatch(html, INLINE_SCRIPT, 'inline <script>');
  if (!html.includes('<title>')) throw new Error('load order: index.html needs a <title> to put the stylesheet before');
  if (!html.includes('</body>')) throw new Error('load order: index.html has no </body> to put the script before');
  return html
    .replace(style, '')
    .replace(script, '')
    .replace('<title>', () => `${style}\n    <title>`)
    .replace('</body>', () => `  ${script}\n  </body>`);
}

/** What check-dist reports when the built page would paint unstyled or wait for the script before showing anything. */
export function loadOrderProblems(html: string): string[] {
  const firstStyle = html.search(/<style\b/i);
  const firstScript = html.search(/<script\b/i);
  const body = html.search(/<body\b/i);
  if (firstStyle === -1 || firstScript === -1 || body === -1) return ['index.html needs an inline <style>, an inline <script> and a <body>'];
  const problems: string[] = [];
  if (firstStyle > firstScript || firstStyle > body) problems.push('the inline <style> must come before the first <script> and <body>, or the page paints unstyled');
  if (firstScript < body) problems.push('the inline <script> must come after the page content in <body>, or nothing shows while it downloads');
  return problems;
}

function onlyMatch(html: string, pattern: RegExp, description: string): string {
  const matches = [...html.matchAll(pattern)].map((match) => match[0]);
  const [match] = matches;
  if (match === undefined || matches.length > 1) throw new Error(`load order: expected exactly one ${description}, found ${matches.length}`);
  return match;
}
