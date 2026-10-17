import { h } from './dom.ts';

export interface Switch {
  readonly row: HTMLDivElement;
  set(checked: boolean): void;
}

/** An on/off setting with a note below it; the note describes the switch for screen readers. */
export function createSwitch(id: string, label: string, note: string, onChange: (checked: boolean) => void): Switch {
  const noteId = `${id}-note`;
  const button = h(
    'button',
    { type: 'button', role: 'switch', class: 'switch', id, 'aria-checked': 'false', 'aria-describedby': noteId },
    h('span', { class: 'switch-label' }, label),
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
  );
  button.addEventListener('click', () => onChange(button.getAttribute('aria-checked') !== 'true'));
  return {
    row: h('div', { class: 'setting' }, button, h('p', { class: 'setting-note', id: noteId }, note)),
    set: (checked) => button.setAttribute('aria-checked', String(checked)),
  };
}
