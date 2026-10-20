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

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas is not available');
  return context;
}

const OPEN_LIST = ':open';

/** An Escape that closes a select's own list (customizable select) reaches the page too; it must not also close what holds the select. */
export function closesSelectList(event: KeyboardEvent): boolean {
  return event.target instanceof Element && CSS.supports(`selector(${OPEN_LIST})`) && event.target.closest('select')?.matches(OPEN_LIST) === true;
}

/**
 * A customizable select (appearance: base-select) is only as wide as its chosen option, so it would change width
 * with every choice; this keeps it as wide as its widest option, hidden ones included, as a native select is.
 */
export function holdWidestOptionWidth(select: HTMLSelectElement): void {
  const measure = context2d(document.createElement('canvas'));
  const fit = () => {
    const style = getComputedStyle(select);
    if (style.appearance !== 'base-select') {
      select.style.minWidth = '';
      return;
    }
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const widestText = Math.max(...[...select.options].map((option) => measure.measureText(option.text).width));
    const frame = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce((sum, length) => sum + Number.parseFloat(length), 0);
    select.style.minWidth = `${Math.ceil(widestText + frame)}px`;
  };
  fit();
  document.fonts.addEventListener('loadingdone', fit);
  window.addEventListener('resize', fit);
  new MutationObserver(fit).observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
}
