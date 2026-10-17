export interface Popover {
  close(restoreFocus: boolean): void;
}

/** A button that opens a panel next to it; Escape, a click outside or leaving it with the keyboard closes it. */
export function attachPopover(trigger: HTMLButtonElement, panel: HTMLElement): Popover {
  if (panel.id === '') throw new Error('a popover panel needs an id for aria-controls');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  panel.hidden = true;

  const open = () => {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    panel.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus();
  };
  const close = (restoreFocus: boolean) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const isInside = (target: EventTarget | null) => target instanceof Node && (panel.contains(target) || trigger.contains(target));

  trigger.addEventListener('click', () => (panel.hidden ? open() : close(false)));
  for (const element of [trigger, panel]) {
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.preventDefault();
      close(true);
    });
  }
  panel.addEventListener('focusout', (event) => {
    if (!isInside(event.relatedTarget)) close(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isInside(event.target)) close(false);
  });
  return { close };
}
