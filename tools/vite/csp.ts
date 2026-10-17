import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Adds a Content-Security-Policy meta tag to the inlined single-file build. Inline scripts and styles
 * are allowed by hash only; connect-src 'none' turns "no runtime network requests" into an enforced rule.
 * Must run after vite-plugin-singlefile has inlined everything.
 */
export function cspPlugin(): Plugin {
  return {
    name: 'tour-atlas:csp',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;
          const html = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source);
          output.source = injectContentSecurityPolicy(html);
        }
      },
    },
  };
}

export function injectContentSecurityPolicy(html: string): string {
  const scriptHashes = inlineBodies(html, 'script').map(sha256Source);
  const styleHashes = inlineBodies(html, 'style').map(sha256Source);
  if (scriptHashes.length === 0) throw new Error('CSP: no inline script found; was vite-plugin-singlefile applied first?');

  const policy = [
    "default-src 'none'",
    `script-src ${scriptHashes.join(' ')}`,
    `style-src ${styleHashes.length > 0 ? styleHashes.join(' ') : "'none'"}`,
    'img-src data: blob:',
    "font-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const charset = /<meta charset="[^"]+"\s*\/?>/i;
  if (!charset.test(html)) throw new Error('CSP: index.html needs a <meta charset> tag to anchor the policy');
  return html.replace(charset, (tag) => `${tag}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
}

function inlineBodies(html: string, tag: 'script' | 'style'): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map((match) => match[1] ?? '');
}

function sha256Source(content: string): string {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}
