export interface Popover {
  close(restoreFocus: boolean): void;
}

export interface FloatingPopover extends Popover {
  /**
   * Shows the panel, focusing its first control when asked; closing with Escape returns focus to what had it before.
   * A touch must not move focus: the mouse events browsers send after it would blur the panel and close it.
   */
  open(moveFocus: boolean): void;
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
    focusFirstControl(panel);
  };
  const close = (restoreFocus: boolean) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const isInside = (target: EventTarget | null) => target instanceof Node && (panel.contains(target) || trigger.contains(target));

  trigger.addEventListener('click', () => (panel.hidden ? open() : close(false)));
  closeOnDismiss([trigger, panel], panel, isInside, close);
  return { close };
}

/** A panel opened at a spot instead of by a button, like a context menu; it closes the same ways as a popover. */
export function attachFloatingPopover(panel: HTMLElement): FloatingPopover {
  panel.hidden = true;
  let returnFocus: HTMLElement | null = null;

  const close = (restoreFocus: boolean) => {
    if (panel.hidden) return;
    panel.hidden = true;
    if (restoreFocus) returnFocus?.focus();
    returnFocus = null;
  };
  const isInside = (target: EventTarget | null) => target instanceof Node && panel.contains(target);
  closeOnDismiss([panel], panel, isInside, close);
  return {
    open(moveFocus) {
      returnFocus = document.activeElement instanceof HTMLElement && !panel.contains(document.activeElement) ? document.activeElement : null;
      panel.hidden = false;
      if (moveFocus) focusFirstControl(panel);
    },
    close,
  };
}

function focusFirstControl(panel: HTMLElement) {
  panel.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus();
}

function closeOnDismiss(keyTargets: readonly HTMLElement[], panel: HTMLElement, isInside: (target: EventTarget | null) => boolean, close: (restoreFocus: boolean) => void) {
  for (const element of keyTargets) {
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
}
