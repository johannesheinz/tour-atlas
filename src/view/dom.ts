type AttributeValue = string | number | boolean | null | undefined;
type Attributes = Readonly<Record<string, AttributeValue>>;
type Child = Node | string | null | undefined | false;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an HTML element. Text children become text nodes; markup is never parsed. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setAttributes(element, attributes);
  appendChildren(element, children);
  return element;
}

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  setAttributes(element, attributes);
  appendChildren(element, children);
  return element;
}

export function setAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'style') throw new Error('inline style attributes are blocked by the CSP; use classes or element.style');
    if (value === false || value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
}

function appendChildren(element: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function requireElement<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`missing element ${selector}`);
  return element;
}

/** Only http(s) links are rendered; anything else is shown as text. */
export function safeExternalLink(url: string, text: string): HTMLAnchorElement | null {
  if (!URL.canParse(url)) return null;
  const protocol = new URL(url).protocol;
  if (protocol !== 'https:' && protocol !== 'http:') return null;
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, text);
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
