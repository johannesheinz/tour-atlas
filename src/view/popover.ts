import { POPOVER_VIEWPORT_MARGIN_PX, placeInViewport, type Box } from './popoverPlacement.ts';

export interface Popover {
  close(restoreFocus: boolean): void;
}

export interface FloatingPopover extends Popover {
  /**
   * Shows the panel, focusing its first control when asked; closing with Escape returns focus to what had it before.
   * A touch must not move focus: the mouse events browsers send after it would blur the panel and close it.
   * The panel opens beside the spot (clientX, clientY), on whichever side keeps it whole in the window, so the
   * finger of a long press that opened it is never on it.
   */
  open(moveFocus: boolean, clientX: number, clientY: number): void;
}

/**
 * A button that opens a panel next to it; Escape, a click outside or leaving it with the keyboard closes it.
 * onOpen runs before the panel shows, so it can refresh what the panel says.
 */
export function attachPopover(trigger: HTMLButtonElement, panel: HTMLElement, onOpen?: () => void): Popover {
  if (panel.id === '') throw new Error('a popover panel needs an id for aria-controls');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  panel.hidden = true;

  const placement = keepInViewport(panel, () => {
    const anchor = panel.offsetParent;
    if (!(anchor instanceof HTMLElement)) throw new Error(`popover ${panel.id} has nothing it is positioned in`);
    return { panel: panel.getBoundingClientRect(), anchor: anchor.getBoundingClientRect() };
  });
  const open = () => {
    onOpen?.();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    placement.start();
    focusFirstControl(panel);
  };
  const close = (restoreFocus: boolean) => {
    if (panel.hidden) return;
    panel.hidden = true;
    placement.stop();
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
  let spot: Box = { left: 0, top: 0, width: 0, height: 0 };
  const placement = keepInViewport(panel, () => ({ panel: { left: spot.left, top: spot.top, width: panel.offsetWidth, height: panel.offsetHeight }, anchor: spot }));

  const close = (restoreFocus: boolean) => {
    if (panel.hidden) return;
    panel.hidden = true;
    placement.stop();
    if (restoreFocus) returnFocus?.focus();
    returnFocus = null;
  };
  const isInside = (target: EventTarget | null) => target instanceof Node && panel.contains(target);
  closeOnDismiss([panel], panel, isInside, close);
  return {
    open(moveFocus, clientX, clientY) {
      returnFocus = document.activeElement instanceof HTMLElement && !panel.contains(document.activeElement) ? document.activeElement : null;
      spot = { left: clientX, top: clientY, width: 0, height: 0 };
      placement.stop();
      panel.hidden = false;
      placement.start();
      if (moveFocus) focusFirstControl(panel);
    },
    close,
  };
}

const PLACEMENT_PROPERTIES = ['position', 'left', 'top', 'right', 'bottom', 'max-height', 'overflow-y'] as const;

/**
 * An open panel is fixed to the window where `measure` says it goes next to its anchor (for a button's panel,
 * where its stylesheet puts it), so a scrolling ancestor (the phone's stage) cannot cut it off and it lies over the
 * bottom sheet; it flips or shifts to stay whole in the window, also when the page scrolls or the window resizes.
 */
function keepInViewport(panel: HTMLElement, measure: () => { readonly panel: Box; readonly anchor: Box }) {
  const place = () => {
    for (const property of PLACEMENT_PROPERTIES) panel.style.removeProperty(property);
    const wanted = measure();
    const placement = placeInViewport(wanted.panel, wanted.anchor, { width: document.documentElement.clientWidth, height: window.innerHeight }, POPOVER_VIEWPORT_MARGIN_PX);
    panel.style.position = 'fixed';
    panel.style.left = `${placement.left}px`;
    panel.style.top = `${placement.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    if (placement.maxHeight !== null) {
      panel.style.maxHeight = `${placement.maxHeight}px`;
      panel.style.overflowY = 'auto';
    }
  };
  /** Scrolling inside the panel moves nothing around it. */
  const onScroll = (event: Event) => {
    if (event.target instanceof Node && event.target.contains(panel)) place();
  };
  return {
    start() {
      place();
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', place);
    },
    stop() {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', place);
      for (const property of PLACEMENT_PROPERTIES) panel.style.removeProperty(property);
    },
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
