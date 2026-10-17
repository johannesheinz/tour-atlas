import { logoFor } from '../logos.ts';
import { h } from './dom.ts';

export interface BandIdentity {
  readonly element: HTMLSpanElement;
  update(bandId: string, name: string): void;
}

/** The band's logo first and its name after it; with a logo the name is set small, without one it carries the identity alone. */
export function createBandIdentity(context: string): BandIdentity {
  const logo = h('img', { class: 'band-identity-logo', alt: '', loading: 'lazy', decoding: 'async', hidden: true });
  const name = h('span', { class: 'band-identity-name' });
  const element = h('span', { class: `band-identity ${context}` }, logo, name);
  return {
    element,
    update(bandId, bandName) {
      const url = logoFor(bandId);
      logo.hidden = url === null;
      if (url !== null && logo.getAttribute('src') !== url) logo.setAttribute('src', url);
      element.classList.toggle('has-logo', url !== null);
      name.textContent = bandName;
    },
  };
}

export function bandIdentity(bandId: string, name: string, context: string): HTMLSpanElement {
  const identity = createBandIdentity(context);
  identity.update(bandId, name);
  return identity.element;
}
