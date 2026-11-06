import { t } from '../i18n/index.ts';
import { h, prefersReducedMotion } from './dom.ts';
import {
  SHEET_SETTINGS,
  clampToSizes,
  releaseVelocity,
  sheetCover,
  sheetSizes,
  snapAfterDrag,
  steppedHeight,
  toggledHeight,
  type DragSample,
  type SheetHeight,
  type SheetSizes,
} from './sheetSnap.ts';

export interface BottomSheetParts {
  /** The sidebar, which becomes the sheet. */
  readonly sheet: HTMLElement;
  readonly handle: HTMLButtonElement;
  /** Scrolls the sheet's content; inert while the sheet is closed. */
  readonly body: HTMLElement;
  /** The full sheet stops just below it. */
  readonly ceiling: HTMLElement;
  /** Scrolls when the map and timeline do not fit above the closed sheet, which moves the map frame. */
  readonly stage: HTMLElement;
  readonly mapFrame: HTMLElement;
  /** Stays in view above the half sheet. */
  readonly mapControls: HTMLElement;
  /** Sit at the bottom of the map frame and rise with the sheet's top edge, so it never covers them. */
  readonly risers: readonly HTMLElement[];
  /** Moves to the end of the sheet's content while there is a sheet: the page footer. */
  readonly tail: HTMLElement;
}

export interface BottomSheetCallbacks {
  /** How much of the map the sheet will hide once it comes to rest, in px; called as it starts to move there. */
  onMapCover(pixels: number): void;
  /** The sheet came to rest at a height it was moved to (not after a resize). */
  onRest(height: SheetHeight): void;
}

export interface BottomSheetView {
  /** The handle's text; `accessible` is a longer name that contains it, or null for the text alone. */
  setLabel(visible: string, accessible: string | null): void;
  /** A selection opened in the sheet: it rises to half; when the viewer opened it, it slides and is announced. */
  reveal(title: string, byViewer: boolean): void;
  /** False when there is no open sheet to close. */
  close(): boolean;
}

/** The map's status bar and controls keep this distance from the map's edges and from the sheet (.map-status-bar, .map-controls in styles.css). */
const RISER_GAP_PX = 10;

/**
 * The lists on phones: a sheet over the map and timeline that rests closed (its handle), at half or full height.
 * The handle is a button: it toggles, arrow keys step, and touch, pen or mouse drag it. The page never moves; the
 * sheet slides by transforms and only takes its new height once it rests, so its content scrolls to the end.
 */
export function createBottomSheet(parts: BottomSheetParts, layout: MediaQueryList, callbacks: BottomSheetCallbacks): BottomSheetView {
  const { sheet, handle, body, ceiling, stage, mapFrame, mapControls, risers, tail } = parts;
  const hint = h('span', { id: 'sheet-handle-hint', hidden: true }, t().sheet.handleHint);
  const announcer = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  sheet.append(hint, announcer);
  handle.setAttribute('aria-describedby', hint.id);
  const tailParent = tail.parentElement;
  if (tailParent === null) throw new Error('the footer has no place on the page');
  const tailHome = { parent: tailParent, next: tail.nextSibling };

  let active = false;
  let height: SheetHeight = 'closed';
  let sizes: SheetSizes | null = null;
  let viewportHeight = 0;
  let mapFrameBottom = 0;
  let mapFrameHeight = 0;
  let drag: { readonly pointerId: number; readonly startY: number; readonly startVisible: number; readonly samples: DragSample[]; moved: boolean } | null = null;
  let suppressClick = false;
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  /** A move to a height is on its way, so the next rest reports it. */
  let arriving = false;

  const currentSizes = (): SheetSizes => {
    if (sizes === null) throw new Error('the sheet has not been measured');
    return sizes;
  };
  const currentVisible = () => viewportHeight - sheet.getBoundingClientRect().top;

  function measure() {
    viewportHeight = window.innerHeight;
    sizes = sheetSizes({
      viewportHeight,
      // The sheet's bottom padding keeps the handle above the home indicator of phones without a home button.
      handleHeight: handle.offsetHeight + sheet.clientTop + Number.parseFloat(getComputedStyle(sheet).paddingBottom),
      ceiling: ceiling.getBoundingClientRect().bottom,
      halfFloor: mapControls.getBoundingClientRect().bottom + RISER_GAP_PX,
    });
    measureMapFrame();
  }

  function measureMapFrame() {
    const frame = mapFrame.getBoundingClientRect();
    mapFrameBottom = frame.bottom;
    mapFrameHeight = frame.height;
  }

  function moveRisers(visible: number) {
    const cover = sheetCover(visible, viewportHeight, mapFrameBottom);
    for (const riser of risers) {
      const rise = Math.min(cover, Math.max(0, mapFrameHeight - riser.offsetHeight - 2 * RISER_GAP_PX));
      riser.style.transform = rise === 0 ? '' : `translateY(${-rise}px)`;
    }
  }

  function setSnapping(snapping: boolean) {
    for (const element of [sheet, ...risers]) element.classList.toggle('is-snapping', snapping);
  }

  /** While it moves the sheet is full height, shifted down, so dragging up never runs out of sheet. */
  function moveTo(visible: number) {
    const full = currentSizes().full;
    sheet.style.height = `${full}px`;
    sheet.style.transform = `translateY(${full - visible}px)`;
    moveRisers(visible);
  }

  function rest() {
    clearTimeout(restTimer);
    setSnapping(false);
    const visible = currentSizes()[height];
    sheet.style.height = `${visible}px`;
    sheet.style.transform = '';
    moveRisers(visible);
    body.inert = height === 'closed';
    if (!arriving) return;
    arriving = false;
    callbacks.onRest(height);
  }

  function slideTo(next: SheetHeight, animate: boolean) {
    const from = currentVisible();
    height = next;
    handle.setAttribute('aria-expanded', String(next !== 'closed'));
    const target = currentSizes()[next];
    arriving = true;
    measureMapFrame();
    callbacks.onMapCover(sheetCover(target, viewportHeight, mapFrameBottom));
    if (next === 'closed' && document.activeElement instanceof HTMLElement && body.contains(document.activeElement)) handle.focus({ preventScroll: true });
    clearTimeout(restTimer);
    if (!animate || prefersReducedMotion() || Math.abs(from - target) < 1) {
      rest();
      return;
    }
    body.inert = false;
    setSnapping(false);
    moveTo(from);
    // Lays the start out, so the transition runs from it.
    void sheet.offsetHeight;
    setSnapping(true);
    moveTo(target);
    restTimer = setTimeout(rest, SHEET_SETTINGS.snapDurationMs + 100);
  }

  sheet.addEventListener('transitionend', (event) => {
    if (event.target === sheet && event.propertyName === 'transform' && sheet.classList.contains('is-snapping')) rest();
  });

  handle.addEventListener('pointerdown', (event) => {
    suppressClick = false;
    if (!active || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    handle.setPointerCapture(event.pointerId);
    const startVisible = currentVisible();
    drag = { pointerId: event.pointerId, startY: event.clientY, startVisible, samples: [{ time: event.timeStamp, visibleHeight: startVisible }], moved: false };
  });

  handle.addEventListener('pointermove', (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < SHEET_SETTINGS.dragThresholdPx) return;
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(restTimer);
      setSnapping(false);
      body.inert = false;
      sheet.classList.add('is-dragging');
    }
    const visible = clampToSizes(currentSizes(), drag.startVisible + drag.startY - event.clientY);
    moveTo(visible);
    drag.samples.push({ time: event.timeStamp, visibleHeight: visible });
  });

  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const { moved, samples } = drag;
    drag = null;
    if (!moved) return;
    // A finger that rests before letting go sends no moves, so the release itself says the sheet stood still.
    samples.push({ time: event.timeStamp, visibleHeight: currentVisible() });
    suppressClick = true;
    sheet.classList.remove('is-dragging');
    slideTo(snapAfterDrag(currentSizes(), currentVisible(), cancelled ? 0 : releaseVelocity(samples)), true);
  };
  handle.addEventListener('pointerup', (event) => endDrag(event, false));
  handle.addEventListener('pointercancel', (event) => endDrag(event, true));

  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (active) slideTo(toggledHeight(height), true);
  });

  handle.addEventListener('keydown', (event) => {
    if (!active || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const next = steppedHeight(height, event.key === 'ArrowUp' ? 'up' : 'down');
    if (next === height) return;
    slideTo(next, true);
    announcer.textContent = t().sheet.heights[next];
  });

  function remeasure() {
    if (!active || drag !== null) return;
    measure();
    rest();
    callbacks.onMapCover(sheetCover(currentSizes()[height], viewportHeight, mapFrameBottom));
  }

  function activate() {
    active = true;
    body.append(tail);
    measure();
    handle.setAttribute('aria-expanded', String(height !== 'closed'));
    rest();
    callbacks.onMapCover(sheetCover(currentSizes()[height], viewportHeight, mapFrameBottom));
  }

  function deactivate() {
    active = false;
    arriving = false;
    drag = null;
    clearTimeout(restTimer);
    setSnapping(false);
    sheet.classList.remove('is-dragging');
    sheet.style.height = '';
    sheet.style.transform = '';
    for (const riser of risers) riser.style.transform = '';
    body.inert = false;
    tailHome.parent.insertBefore(tail, tailHome.next);
    callbacks.onMapCover(0);
  }

  layout.addEventListener('change', () => (layout.matches ? activate() : deactivate()));
  window.addEventListener('resize', remeasure);
  // The map frame settles after the sheet first measures it, once fonts and the timeline's lanes are in.
  const resizeObserver = new ResizeObserver(remeasure);
  resizeObserver.observe(ceiling);
  resizeObserver.observe(mapFrame);
  stage.addEventListener(
    'scroll',
    () => {
      if (!active) return;
      measureMapFrame();
      moveRisers(currentVisible());
    },
    { passive: true },
  );
  if (layout.matches) activate();

  return {
    setLabel(visible, accessible) {
      handle.textContent = visible;
      if (accessible === null) handle.removeAttribute('aria-label');
      else handle.setAttribute('aria-label', accessible);
    },
    reveal(title, byViewer) {
      if (!active) return;
      slideTo('half', byViewer);
      if (byViewer) announcer.textContent = t().sheet.opened(title);
    },
    close() {
      if (!active || height === 'closed') return false;
      slideTo('closed', true);
      return true;
    },
  };
}
