import { scaleUtc, type ScaleTime } from 'd3-scale';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, ZoomTransform, type D3ZoomEvent } from 'd3-zoom';
import type { TimeWindow } from '../appState.ts';
import type { BandEntry, ShowRef } from '../model.ts';
import { context2d, h, prefersReducedMotion } from './dom.ts';
import { t } from '../i18n/index.ts';
import { formatDateSpan, statusLabel } from './format.ts';
import { DAY_MS, fitDateDomain, timeTicks } from './timeScale.ts';
import { bandColor } from '../model.ts';
import type { ThemeColors } from './theme.ts';
import { createTooltip } from './tooltip.ts';
import { showTooltip } from './tooltipContent.ts';

export const TIMELINE_SETTINGS = {
  laneHeight: 38,
  compactLaneHeight: 24,
  compactAbove: 15,
  axisHeight: 30,
  maxViewportFraction: 0.42,
  minViewportHeight: 140,
  dotRadius: 4.5,
  hitRadiusPx: 9,
  paddingFraction: 0.03,
  minSpanDays: 14,
  minVisibleDays: 3,
  fitDurationMs: 300,
  /** A drag shorter than this is a click. */
  brushThresholdPx: 5,
  laneFont: '17px "League Gothic", "Arial Narrow", sans-serif',
  /** A range starts this many average lane-label characters in, so its first shows are not under the band names. */
  gutterCharacters: 15,
  maxGutterFraction: 0.25,
  compactLaneFont: '15px "League Gothic", "Arial Narrow", sans-serif',
  tickFont: '600 11px Archivo, system-ui, sans-serif',
} as const;

export interface TimelineLane {
  readonly band: BandEntry;
  /** Sorted by start. */
  readonly shows: readonly ShowRef[];
}

export interface TimelineProps {
  readonly lanes: readonly TimelineLane[];
  /** Every show the timeline fits to, including those in collapsed lanes. */
  readonly domainShows: readonly ShowRef[];
  readonly hiddenLaneCount: number;
  readonly emptyMessage: string;
  readonly highlightedShowIds: ReadonlySet<string>;
  readonly selectedShowIds: ReadonlySet<string>;
  readonly focusBandId: string | null;
  readonly theme: ThemeColors;
  readonly today: number;
  /** Forward-looking ranges keep the gutter under the band names free of dots, and of clicks on them. */
  readonly clearGutter: boolean;
}

export interface TimelineCallbacks {
  onHover(shows: readonly ShowRef[] | null): void;
  onSelect(shows: readonly ShowRef[]): void;
  /** Called when a zoom or pan gesture ends, after fits and on resize. byUser is false for programmatic fits. */
  onWindowChange(window: TimeWindow, byUser: boolean): void;
  onShowAllLanes(): void;
}

export interface TimelineLayout {
  /** The most height the lanes may take before they scroll. */
  maxLanesHeight(): number;
}

export interface TimelineView {
  render(props: TimelineProps): void;
  /** Recomputes the full date range from domainShows, then shows `range` (or everything when null). */
  fitToData(animate: boolean, range: readonly [number, number] | null): void;
  zoomToRange(start: number, end: number, animate: boolean): void;
  zoomBy(factor: number): void;
  /** Halves the zoom around the centre (Grafana's "zoom out"). */
  zoomOut(): void;
  /** Moves the window by half its width; -1 earlier, 1 later. */
  shift(direction: -1 | 1): void;
  isAtFit(): boolean;
  readonly lanesOverflow: () => boolean;
}

interface CursorPosition {
  readonly lane: number;
  readonly show: number;
}

export function createTimeline(container: HTMLElement, callbacks: TimelineCallbacks, sizing: TimelineLayout): TimelineView {
  const axisCanvas = h('canvas', { class: 'timeline-axis', 'aria-hidden': 'true' });
  const lanesCanvas = h('canvas', { class: 'timeline-lanes', 'aria-hidden': 'true' });
  const spacer = h('div', { class: 'timeline-spacer' });
  const scroller = h('div', { class: 'timeline-scroll' }, lanesCanvas, spacer);
  const brush = h('div', { class: 'timeline-brush', hidden: true, 'aria-hidden': 'true' });
  const cursor = h('button', { type: 'button', class: 'timeline-cursor', 'aria-label': t().timeline.cursor });
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  const empty = h('p', { class: 'timeline-empty', hidden: true });
  const noteText = h('span');
  const showAllLanes = h('button', { type: 'button', class: 'text-button' }, t().timeline.showAllLanes);
  const note = h('p', { class: 'timeline-note', hidden: true }, noteText, showAllLanes);
  showAllLanes.addEventListener('click', () => callbacks.onShowAllLanes());
  container.append(axisCanvas, scroller, brush, cursor, announcer, empty, note);
  const tooltip = createTooltip(container);

  const axisContext = context2d(axisCanvas);
  const lanesContext = context2d(lanesCanvas);

  let width = 0;
  let viewportHeight = 0;
  let laneHeight: number = TIMELINE_SETTINGS.laneHeight;
  let scrollTop = 0;
  let props: TimelineProps | null = null;
  let baseScale: ScaleTime<number, number> = scaleUtc();
  let transform: ZoomTransform = zoomIdentity;
  /** The transform that shows every show; isAtFit compares against it. */
  let fitTransform: ZoomTransform = zoomIdentity;
  /** Pixels at the left kept for the band names before a range starts. */
  let gutter = 0;
  let cursorPosition: CursorPosition | null = null;
  let hoveredShowId: string | null = null;
  let drawScheduled = false;
  let silent = false;
  let hasFitted = false;
  let pendingRange: [number, number] | null = null;
  let programmatic = false;
  let brushStart: { readonly x: number; readonly pointerId: number } | null = null;
  let brushing = false;
  let suppressClick = false;

  /** d3-zoom only animates programmatic moves; users zoom by dragging a range, the wheel scrolls lanes. */
  const zoomBehavior = zoom<HTMLDivElement, unknown>()
    .filter(() => false)
    .on('start', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      if (event.sourceEvent !== null) programmatic = false;
    })
    .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      if (event.sourceEvent !== null) tooltip.hide();
      transform = event.transform;
      scheduleDraw();
      positionCursor();
    })
    .on('end', () => {
      if (silent) return;
      emitWindow(!programmatic);
      programmatic = false;
    });
  const scrollerSelection = select(scroller);
  scrollerSelection.call(zoomBehavior);

  scroller.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      programmatic = false;
      scrollerSelection.call(zoomBehavior.translateBy, -event.deltaX / transform.k, 0);
    },
    { passive: false },
  );
  scroller.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    brushStart = { x: localX(event), pointerId: event.pointerId };
    brushing = false;
  });
  scroller.addEventListener('pointerup', (event) => {
    if (brushStart === null || event.pointerId !== brushStart.pointerId) return;
    const startX = brushStart.x;
    brushStart = null;
    if (!brushing) return;
    brushing = false;
    suppressClick = true;
    brush.hidden = true;
    const x = currentScale();
    const [from, to] = [startX, localX(event)].toSorted((a, b) => a - b);
    if (from === undefined || to === undefined) return;
    animateTo(transformFor(x.invert(Math.max(0, from)).getTime(), x.invert(Math.min(width, to)).getTime()));
  });
  scroller.addEventListener('pointercancel', () => {
    brushStart = null;
    brushing = false;
    brush.hidden = true;
  });
  scroller.addEventListener('dblclick', (event) => {
    event.preventDefault();
    zoomOutAround(localX(event));
  });
  scroller.addEventListener('scroll', () => {
    scrollTop = scroller.scrollTop;
    scheduleDraw();
    positionCursor();
  });
  scroller.addEventListener('pointermove', (event) => {
    if (brushStart !== null && event.pointerId === brushStart.pointerId) {
      const x = localX(event);
      if (!brushing && Math.abs(x - brushStart.x) > TIMELINE_SETTINGS.brushThresholdPx) {
        brushing = true;
        scroller.setPointerCapture(event.pointerId);
        tooltip.hide();
      }
      if (brushing) {
        const [from, to] = [brushStart.x, x].toSorted((a, b) => a - b);
        brush.style.setProperty('--from', `${Math.max(0, from ?? 0)}px`);
        brush.style.setProperty('--to', `${Math.min(width, to ?? 0)}px`);
        brush.style.setProperty('--height', `${viewportHeight}px`);
        brush.hidden = false;
        return;
      }
    }
    if (event.buttons !== 0) return;
    const ref = showAtPointer(event);
    scroller.classList.toggle('is-over-show', ref !== null);
    const id = ref?.show.id ?? null;
    if (id === hoveredShowId) return;
    hoveredShowId = id;
    if (ref === null) tooltip.hide();
    else showDotTooltip(ref, laneIndexAt(event));
    callbacks.onHover(ref === null ? null : [ref]);
  });
  scroller.addEventListener('pointerleave', () => {
    tooltip.hide();
    if (hoveredShowId === null) return;
    hoveredShowId = null;
    callbacks.onHover(null);
  });
  scroller.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const ref = showAtPointer(event);
    callbacks.onSelect(ref === null ? [] : [ref]);
  });

  cursor.addEventListener('focus', () => {
    if (props === null) return;
    const start = cursorPosition ?? firstVisibleShow();
    if (start !== null) moveCursor(start);
  });
  cursor.addEventListener('blur', () => {
    tooltip.hide();
    callbacks.onHover(null);
  });
  cursor.addEventListener('keydown', (event) => {
    if (props === null || cursorPosition === null) return;
    const { lanes } = props;
    const { lane, show } = cursorPosition;
    const currentLane = lanes[lane];
    if (currentLane === undefined) return;
    const moves: Record<string, () => CursorPosition | null> = {
      ArrowRight: () => ({ lane, show: Math.min(currentLane.shows.length - 1, show + 1) }),
      ArrowLeft: () => ({ lane, show: Math.max(0, show - 1) }),
      ArrowDown: () => nearestInLane(lane + 1, currentLane.shows[show]),
      ArrowUp: () => nearestInLane(lane - 1, currentLane.shows[show]),
      Home: () => ({ lane, show: 0 }),
      End: () => ({ lane, show: currentLane.shows.length - 1 }),
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      const target = move();
      if (target !== null) moveCursor(target);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const ref = currentLane.shows[show];
      if (ref !== undefined) callbacks.onSelect([ref]);
    } else if (event.key === '+' || event.key === '=') {
      zoomBy(1.6);
    } else if (event.key === '-') {
      zoomBy(1 / 1.6);
    }
  });

  new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const nextWidth = Math.round(entry.contentRect.width);
    if (nextWidth === width) return;
    width = nextWidth;
    measureGutter();
    layout();
    fitToData(false, null);
    if (pendingRange !== null) {
      const [start, end] = pendingRange;
      pendingRange = null;
      zoomToRange(start, end, false);
    }
  }).observe(container);
  window.addEventListener('resize', () => layout());

  function layout() {
    if (props === null || width === 0) return;
    const lanes = props.lanes.length;
    laneHeight = lanes > TIMELINE_SETTINGS.compactAbove ? TIMELINE_SETTINGS.compactLaneHeight : TIMELINE_SETTINGS.laneHeight;
    const total = Math.max(1, lanes) * laneHeight;
    const maxHeight = Math.max(TIMELINE_SETTINGS.minViewportHeight, sizing.maxLanesHeight());
    viewportHeight = Math.min(total, Math.round(maxHeight));
    scroller.style.height = `${viewportHeight}px`;
    lanesCanvas.style.height = `${viewportHeight}px`;
    spacer.style.height = `${total - viewportHeight}px`;
    container.classList.toggle('has-overflow', total > viewportHeight);
    const ratio = window.devicePixelRatio;
    lanesCanvas.width = Math.round(width * ratio);
    lanesCanvas.height = Math.round(viewportHeight * ratio);
    axisCanvas.width = Math.round(width * ratio);
    axisCanvas.height = Math.round(TIMELINE_SETTINGS.axisHeight * ratio);
    baseScale.range([0, width]);
    zoomBehavior.translateExtent([
      [-width, Number.NEGATIVE_INFINITY],
      [2 * width, Number.POSITIVE_INFINITY],
    ]);
    scheduleDraw();
  }

  function render(next: TimelineProps) {
    const previous = props;
    props = next;
    empty.hidden = next.lanes.length > 0;
    empty.textContent = next.emptyMessage;
    note.hidden = next.hiddenLaneCount === 0;
    noteText.textContent = `${t().timeline.hiddenLanes(next.hiddenLaneCount)} `;
    if (previous === null || previous.lanes.length !== next.lanes.length) layout();
    if (cursorPosition !== null && next.lanes[cursorPosition.lane]?.shows[cursorPosition.show] === undefined) cursorPosition = null;
    scheduleDraw();
  }

  function fitToData(animate: boolean, range: readonly [number, number] | null) {
    if (props === null || width === 0) {
      if (range !== null) pendingRange = [range[0], range[1]];
      return;
    }
    const ranges = props.domainShows;
    const domain: [number, number] =
      ranges.length === 0
        ? [props.today - 30 * DAY_MS, props.today + 30 * DAY_MS]
        : fitDateDomain(ranges, TIMELINE_SETTINGS.paddingFraction, TIMELINE_SETTINGS.minSpanDays);
    const currentDomain = transform.rescaleX(baseScale).domain().map((date) => date.getTime());
    const hadDomain = hasFitted;
    hasFitted = true;

    baseScale = scaleUtc().domain(domain).range([0, width]);
    const maxZoom = Math.max(1, (domain[1] - domain[0]) / (TIMELINE_SETTINGS.minVisibleDays * DAY_MS));
    zoomBehavior.scaleExtent([0.5, maxZoom]);

    fitTransform = transformFor(domain[0], domain[1]);
    const target = range === null ? fitTransform : transformFor(range[0], range[1]);
    const [currentStart, currentEnd] = currentDomain;
    if (!animate || !hadDomain || prefersReducedMotion() || currentStart === undefined || currentEnd === undefined) {
      setTransform(target);
      emitWindow(false);
      return;
    }
    setTransform(transformFor(currentStart, currentEnd));
    programmatic = true;
    scrollerSelection.transition().duration(TIMELINE_SETTINGS.fitDurationMs).call(zoomBehavior.transform, target);
  }

  /** Puts start at the gutter's edge and end at the right edge. */
  function transformFor(start: number, end: number): ZoomTransform {
    const k = (width - gutter) / (baseScale(end) - baseScale(start));
    return new ZoomTransform(k, gutter - k * baseScale(start), 0);
  }

  /** The time range right of the gutter: what the band names leave visible, and what the app filters by. */
  function visibleRange(): [number, number] {
    const x = currentScale();
    return [x.invert(gutter).getTime(), x.invert(width).getTime()];
  }

  /** Dots left of this x are not drawn or clickable: inside the gutter, for forward-looking ranges. */
  function firstDotX(): number {
    return props?.clearGutter === true ? gutter - TIMELINE_SETTINGS.dotRadius - 2 : Number.NEGATIVE_INFINITY;
  }

  function clipToDots() {
    const left = firstDotX();
    if (left === Number.NEGATIVE_INFINITY) return;
    lanesContext.beginPath();
    lanesContext.rect(left, 0, width - left, viewportHeight);
    lanesContext.clip();
  }

  function measureGutter() {
    lanesContext.font = TIMELINE_SETTINGS.laneFont;
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const averageCharacter = lanesContext.measureText(alphabet).width / alphabet.length;
    gutter = Math.round(Math.min(width * TIMELINE_SETTINGS.maxGutterFraction, averageCharacter * TIMELINE_SETTINGS.gutterCharacters + 12));
  }

  function zoomToRange(start: number, end: number, animate: boolean) {
    if (end <= start) throw new RangeError('zoomToRange needs end after start');
    if (width === 0 || !hasFitted) {
      pendingRange = [start, end];
      return;
    }
    const target = transformFor(start, end);
    if (!animate || prefersReducedMotion()) {
      setTransform(target);
      emitWindow(false);
      return;
    }
    programmatic = true;
    scrollerSelection.transition().duration(TIMELINE_SETTINGS.fitDurationMs).call(zoomBehavior.transform, target);
  }

  /** Jumps without emitting a window change; callers that need one emit it themselves. */
  function setTransform(next: ZoomTransform) {
    silent = true;
    scrollerSelection.interrupt().call(zoomBehavior.transform, next);
    silent = false;
    transform = next;
    scheduleDraw();
  }

  function zoomBy(factor: number) {
    programmatic = false;
    scrollerSelection.call(zoomBehavior.scaleBy, factor, [width / 2, 0]);
  }

  /** A user-initiated animated move: its end clears the preset. */
  function animateTo(target: ZoomTransform) {
    programmatic = false;
    if (prefersReducedMotion()) {
      setTransform(target);
      emitWindow(true);
      return;
    }
    scrollerSelection.transition().duration(TIMELINE_SETTINGS.fitDurationMs).call(zoomBehavior.transform, target);
  }

  function zoomOutAround(x: number) {
    if (width === 0) return;
    const [start, end] = visibleRange();
    const center = currentScale().invert(Math.max(gutter, x)).getTime();
    const span = (end - start) * 2;
    const fraction = (Math.max(gutter, x) - gutter) / (width - gutter);
    animateTo(transformFor(center - span * fraction, center + span * (1 - fraction)));
  }

  function shift(direction: -1 | 1) {
    const [start, end] = visibleRange();
    const offset = ((end - start) / 2) * direction;
    animateTo(transformFor(start + offset, end + offset));
  }

  function localX(event: MouseEvent): number {
    return event.clientX - scroller.getBoundingClientRect().left;
  }

  function currentScale(): ScaleTime<number, number> {
    return transform.rescaleX(baseScale);
  }

  function emitWindow(byUser: boolean) {
    const [start, end] = visibleRange();
    callbacks.onWindowChange({ start, end }, byUser);
  }

  function scheduleDraw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => {
      drawScheduled = false;
      draw();
    });
  }

  function dotCenter(x: ScaleTime<number, number>, ref: ShowRef): [number, number] {
    return [x(ref.start + DAY_MS / 2), x(ref.end + DAY_MS / 2)];
  }

  function laneTop(index: number): number {
    return index * laneHeight - scrollTop;
  }

  function dotY(index: number): number {
    return laneTop(index) + (laneHeight === TIMELINE_SETTINGS.laneHeight ? 27 : laneHeight / 2);
  }

  function draw() {
    if (props === null || width === 0) return;
    const x = currentScale();
    drawAxis(x, props);
    drawLanes(x, props);
  }

  function drawAxis(x: ScaleTime<number, number>, current: TimelineProps) {
    const ratio = axisCanvas.width / width;
    const height = TIMELINE_SETTINGS.axisHeight;
    axisContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    axisContext.clearRect(0, 0, width, height);
    axisContext.font = TIMELINE_SETTINGS.tickFont;
    axisContext.textBaseline = 'middle';
    const [start, end] = x.domain();
    if (start === undefined || end === undefined) return;
    const todayX = x(current.today + DAY_MS / 2);
    const todayLabel = t().timeline.today;
    const todayWidth = axisContext.measureText(todayLabel).width + 10;
    const todayVisible = todayX >= 0 && todayX <= width;
    for (const tick of timeTicks([start.getTime(), end.getTime()], width).ticks) {
      const px = Math.round(x(tick.time)) + 0.5;
      axisContext.strokeStyle = current.theme.ink;
      axisContext.lineWidth = 1;
      axisContext.beginPath();
      axisContext.moveTo(px, tick.major ? 4 : height - 9);
      axisContext.lineTo(px, height);
      axisContext.stroke();
      const labelLeft = px + 4;
      const labelRight = labelLeft + axisContext.measureText(tick.label).width;
      const coveredByToday = todayVisible && labelRight > todayX - todayWidth / 2 - 4 && labelLeft < todayX + todayWidth / 2 + 4;
      if (coveredByToday) continue;
      axisContext.fillStyle = tick.major ? current.theme.ink : current.theme.inkSoft;
      axisContext.fillText(tick.label, labelLeft, height / 2 - 1);
    }
    if (todayVisible) {
      const labelLeft = Math.max(0, Math.min(width - todayWidth, todayX - todayWidth / 2));
      axisContext.fillStyle = current.theme.ink;
      axisContext.fillRect(labelLeft, 6, todayWidth, 18);
      axisContext.fillStyle = current.theme.stock;
      axisContext.textAlign = 'center';
      axisContext.fillText(todayLabel, labelLeft + todayWidth / 2, height / 2 - 1);
      axisContext.textAlign = 'start';
    }
  }

  function drawLanes(x: ScaleTime<number, number>, current: TimelineProps) {
    const ratio = lanesCanvas.width / width;
    lanesContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    lanesContext.clearRect(0, 0, width, viewportHeight);
    const compact = laneHeight !== TIMELINE_SETTINGS.laneHeight;
    const first = Math.max(0, Math.floor(scrollTop / laneHeight));
    const last = Math.min(current.lanes.length - 1, Math.ceil((scrollTop + viewportHeight) / laneHeight));
    const { theme } = current;
    const radius = compact ? TIMELINE_SETTINGS.dotRadius - 1 : TIMELINE_SETTINGS.dotRadius;

    for (let index = first; index <= last; index++) {
      const lane = current.lanes[index];
      if (lane === undefined) continue;
      const top = laneTop(index);
      const y = dotY(index);
      const color = bandColor(lane.band, theme.mode);
      const dimmed = current.focusBandId !== null && current.focusBandId !== lane.band.file.band.id;
      lanesContext.globalAlpha = dimmed ? 0.2 : 1;

      lanesContext.save();
      clipToDots();
      for (const ref of lane.shows) {
        const [startX, endX] = dotCenter(x, ref);
        if (endX < Math.max(-radius, firstDotX())) continue;
        if (startX > width + radius) break;
        lanesContext.globalAlpha = (dimmed ? 0.2 : 1) * (ref.isPast ? 0.5 : 1);
        lanesContext.beginPath();
        if (endX - startX > 1) lanesContext.roundRect(startX - radius, y - radius, endX - startX + 2 * radius, 2 * radius, radius);
        else lanesContext.arc(startX, y, radius, 0, Math.PI * 2);
        if (ref.show.status === 'cancelled') {
          lanesContext.fillStyle = theme.stock;
          lanesContext.fill();
          lanesContext.lineWidth = 2;
          lanesContext.strokeStyle = color;
          lanesContext.stroke();
        } else {
          lanesContext.fillStyle = color;
          lanesContext.fill();
          lanesContext.lineWidth = 1;
          lanesContext.strokeStyle = theme.ink;
          lanesContext.stroke();
        }
      }
      lanesContext.restore();
      lanesContext.fillStyle = theme.inkMuted;
      lanesContext.globalAlpha = 0.35;
      lanesContext.fillRect(0, top + laneHeight - 1, width, 1);
      lanesContext.globalAlpha = 1;
    }

    const todayX = Math.round(x(current.today + DAY_MS / 2)) + 0.5;
    if (todayX >= 0 && todayX <= width) {
      lanesContext.strokeStyle = theme.ink;
      lanesContext.lineWidth = 1.5;
      lanesContext.setLineDash([4, 3]);
      lanesContext.beginPath();
      lanesContext.moveTo(todayX, 0);
      lanesContext.lineTo(todayX, viewportHeight);
      lanesContext.stroke();
      lanesContext.setLineDash([]);
    }

    lanesContext.save();
    clipToDots();
    for (let index = first; index <= last; index++) {
      const lane = current.lanes[index];
      if (lane === undefined) continue;
      for (const ref of lane.shows) {
        const selected = current.selectedShowIds.has(ref.show.id);
        if (!selected && !current.highlightedShowIds.has(ref.show.id)) continue;
        const [startX, endX] = dotCenter(x, ref);
        lanesContext.strokeStyle = theme.ink;
        lanesContext.lineWidth = selected ? 2.5 : 1.5;
        lanesContext.beginPath();
        const ring = radius + (selected ? 4 : 3.5);
        if (endX - startX > 1) lanesContext.roundRect(startX - ring, dotY(index) - ring, endX - startX + 2 * ring, 2 * ring, ring);
        else lanesContext.arc(startX, dotY(index), ring, 0, Math.PI * 2);
        lanesContext.stroke();
      }
    }
    lanesContext.restore();

    lanesContext.font = compact ? TIMELINE_SETTINGS.compactLaneFont : TIMELINE_SETTINGS.laneFont;
    lanesContext.textBaseline = 'alphabetic';
    for (let index = first; index <= last; index++) {
      const lane = current.lanes[index];
      if (lane === undefined) continue;
      const top = laneTop(index);
      const name = lane.band.file.band.name;
      const dimmed = current.focusBandId !== null && current.focusBandId !== lane.band.file.band.id;
      const label = compact ? { x: 6, baseline: top + laneHeight / 2 + 5, backingTop: top + 3, backingHeight: laneHeight - 6 } : { x: 8, baseline: top + 16, backingTop: top + 2, backingHeight: 19 };
      lanesContext.fillStyle = theme.stock;
      lanesContext.globalAlpha = (dimmed ? 0.35 : 1) * 0.85;
      lanesContext.fillRect(0, label.backingTop, lanesContext.measureText(name).width + label.x + 4, label.backingHeight);
      lanesContext.globalAlpha = dimmed ? 0.35 : 1;
      lanesContext.fillStyle = theme.ink;
      lanesContext.fillText(name, label.x, label.baseline);
    }
    lanesContext.globalAlpha = 1;
  }

  function laneIndexAt(event: MouseEvent): number {
    return Math.floor((event.clientY - scroller.getBoundingClientRect().top + scrollTop) / laneHeight);
  }

  function showDotTooltip(ref: ShowRef, laneIndex: number) {
    if (props === null) return;
    const [centerX] = dotCenter(currentScale(), ref);
    tooltip.show(showTooltip(ref, props.theme.mode), centerX, TIMELINE_SETTINGS.axisHeight + dotY(laneIndex));
  }

  function showAtPointer(event: MouseEvent): ShowRef | null {
    if (props === null) return null;
    const rect = scroller.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const laneIndex = laneIndexAt(event);
    const lane = props.lanes[laneIndex];
    if (lane === undefined || Math.abs(py - dotY(laneIndex)) > laneHeight / 2) return null;
    const x = currentScale();
    let best: ShowRef | null = null;
    let bestDistance: number = TIMELINE_SETTINGS.hitRadiusPx;
    for (const ref of lane.shows) {
      const [startX, endX] = dotCenter(x, ref);
      if (endX < firstDotX()) continue;
      const distance = px < startX ? startX - px : px > endX ? px - endX : 0;
      if (distance <= bestDistance) {
        best = ref;
        bestDistance = distance;
      }
    }
    return best;
  }

  function firstVisibleShow(): CursorPosition | null {
    if (props === null) return null;
    const [start] = currentScale().domain();
    const startTime = start?.getTime() ?? Number.NEGATIVE_INFINITY;
    for (const [laneIndex, lane] of props.lanes.entries()) {
      const showIndex = lane.shows.findIndex((ref) => ref.end >= startTime);
      if (showIndex !== -1) return { lane: laneIndex, show: showIndex };
    }
    return null;
  }

  function nearestInLane(laneIndex: number, reference: ShowRef | undefined): CursorPosition | null {
    const lane = props?.lanes[laneIndex];
    if (lane === undefined || reference === undefined || lane.shows.length === 0) return null;
    let bestIndex = 0;
    lane.shows.forEach((ref, index) => {
      const best = lane.shows[bestIndex];
      if (best !== undefined && Math.abs(ref.start - reference.start) < Math.abs(best.start - reference.start)) bestIndex = index;
    });
    return { lane: laneIndex, show: bestIndex };
  }

  function moveCursor(position: CursorPosition) {
    const ref = props?.lanes[position.lane]?.shows[position.show];
    if (ref === undefined) return;
    cursorPosition = position;
    const top = position.lane * laneHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + laneHeight > scroller.scrollTop + viewportHeight) scroller.scrollTop = top + laneHeight - viewportHeight;
    scrollTop = scroller.scrollTop;
    const [centerX] = dotCenter(currentScale(), ref);
    if (centerX < 0 || centerX > width) scrollerSelection.call(zoomBehavior.translateBy, (width / 2 - centerX) / transform.k, 0);
    positionCursor();
    const description = t().timeline.dot(ref.band.file.band.name, formatDateSpan(ref.show.date, ref.show.endDate), ref.show.city, statusLabel(ref));
    cursor.setAttribute('aria-label', description);
    announcer.textContent = description;
    showDotTooltip(ref, position.lane);
    callbacks.onHover([ref]);
  }

  function positionCursor() {
    if (props === null || cursorPosition === null) return;
    const ref = props.lanes[cursorPosition.lane]?.shows[cursorPosition.show];
    if (ref === undefined) return;
    const [centerX] = dotCenter(currentScale(), ref);
    cursor.style.setProperty('--x', `${centerX}px`);
    cursor.style.setProperty('--y', `${TIMELINE_SETTINGS.axisHeight + dotY(cursorPosition.lane)}px`);
  }

  return {
    render,
    fitToData,
    zoomToRange,
    zoomBy,
    zoomOut: () => zoomOutAround(width / 2),
    shift,
    isAtFit: () => Math.abs(transform.k - fitTransform.k) < 1e-6 && Math.abs(transform.x - fitTransform.x) < 0.5,
    lanesOverflow: () => container.classList.contains('has-overflow'),
  };
}
