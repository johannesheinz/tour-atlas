import { geoCircle, geoDistance, geoEqualEarth, geoGraticule10, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import type { Feature, LineString, MultiLineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { WorldTopology } from '../data/countryLocator.ts';
import type { ShowRef } from '../model.ts';
import { context2d, h, prefersReducedMotion, s } from './dom.ts';
import { t } from '../i18n/index.ts';
import { formatDate } from './format.ts';
import { computeGlobeFit, computeMapFit, interpolateFit, type LonLat, type MapFit } from './geoFit.ts';
import { radiusDegrees, type AreaCircle, type MapMode } from './mapRegions.ts';
export type { AreaCircle, MapMode } from './mapRegions.ts';
import { IDLE_PRESS, LONG_PRESS, stepLongPress, type LongPressInput } from './longPress.ts';
import { placeLabels } from './labels.ts';
import { clusterGroups, groupByCoordinates, pinLabel, type DisplayPin, type PinGroup } from './pins.ts';
import { annularSectorPath, pinSegments, type PinSegment } from './pinSegments.ts';
import { bandColor } from '../model.ts';
import type { ThemeTokens } from './theme.ts';
import { createTooltip } from './tooltip.ts';
import { pinTooltip } from './tooltipContent.ts';

export const MAP_SETTINGS = {
  /** The pointed-at pin's ring sits outside the selection ring, so it stands out even when every pin is selected. */
  hoverRingGap: 10,
  padding: 32,
  minSpanKm: 300,
  canvasThreshold: 2000,
  clusterRadiusPx: 12,
  pinRadius: 5,
  multiPinRadius: 7,
  mixedPinRadius: 8.5,
  mixedPinHole: 3.5,
  hitRadiusPx: 12,
  /** A press that moves further than this is a drag, and the click that follows it is ignored. */
  clickDistancePx: 5,
  minZoom: 0.5,
  maxZoom: 40,
  fitDurationMs: 300,
  /** The globe turns further than the flat map moves, so it gets more time. */
  globeFitDurationMs: 900,
  globeMinScale: 0.8,
  globeMaxScale: 60,
  maxBandsWithRoutes: 8,
  labelFont: '600 12px Archivo, system-ui, sans-serif',
  badgeFont: '600 10px Archivo, system-ui, sans-serif',
} as const;

export interface MapProps {
  /** All shows of visible bands. */
  readonly shows: readonly ShowRef[];
  /** The shows the map fits to. */
  readonly fitShows: readonly ShowRef[];
  readonly routeBandIds: ReadonlySet<string>;
  /** Bands whose view is open: their routes are drawn bold. */
  readonly emphasizedBandIds: ReadonlySet<string>;
  readonly highlightedShowIds: ReadonlySet<string>;
  readonly selectedShowIds: ReadonlySet<string>;
  readonly focusBandId: string | null;
  readonly theme: ThemeTokens;
}

export interface MapCallbacks {
  onHover(shows: readonly ShowRef[] | null): void;
  onSelect(shows: readonly ShowRef[]): void;
  /** The viewer started panning, zooming or turning the map. */
  onUserMove(): void;
  /** A click (or Enter on a pin) while picking: the centre for the area. */
  onPickPoint(point: LonLat): void;
  /** A right click (byTouch false) or a long press on the map, at that spot of the window. */
  onPointMenu(point: LonLat, clientX: number, clientY: number, byTouch: boolean): void;
}

/** The routes of these bands draw themselves leg by leg; `at` gives the animation time a show's date is reached. */
export interface MapTour {
  readonly bandIds: ReadonlySet<string>;
  readonly at: (date: number) => number;
}

interface TourLeg {
  readonly bandId: string;
  readonly element: SVGPathElement;
  readonly start: number;
  readonly end: number;
  readonly length: number;
}

export interface MapView {
  render(props: MapProps): void;
  fitToData(animate: boolean): void;
  fitToShows(shows: readonly ShowRef[], animate: boolean): void;
  fitToPoints(points: readonly LonLat[], minSpanKm: number, animate: boolean): void;
  zoomBy(factor: number): void;
  setMode(mode: MapMode): void;
  setAreaCircle(circle: AreaCircle | null): void;
  /** While picking, a click on the map sets a point instead of opening pins. */
  setPicking(picking: boolean): void;
  /** Null draws the routes whole again. */
  setTour(tour: MapTour | null): void;
  setTourTime(ms: number): void;
}

interface PinStyle {
  readonly radius: number;
  /** Band-colour ring for pins with several bands; empty otherwise. */
  readonly segments: readonly PinSegment[];
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
}

export function createMapView(container: HTMLElement, world: WorldTopology, callbacks: MapCallbacks): MapView {
  const land = feature(world, world.objects.land);
  const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
  let mode: MapMode = 'flat';
  let projection: GeoProjection = geoEqualEarth();
  let path = geoPath(projection);
  let areaCircle: AreaCircle | null = null;
  let picking = false;
  let globeFitRadius = 1;

  const halftoneDot = s('circle', { class: 'halftone-dot', cx: 2, cy: 2, r: 1.15 });
  const halftone = s('pattern', { id: 'halftone', patternUnits: 'userSpaceOnUse', width: 4, height: 4 }, halftoneDot);
  const globeShade = s(
    'radialGradient',
    { id: 'globe-shade', cx: '42%', cy: '38%', r: '62%' },
    s('stop', { offset: '70%', class: 'globe-shade-clear' }),
    s('stop', { offset: '100%', class: 'globe-shade-edge' }),
  );
  const spherePath = s('path', { class: 'map-sphere' });
  const graticulePath = s('path', { class: 'map-graticule' });
  const landPath = s('path', { class: 'map-land' });
  const bordersPath = s('path', { class: 'map-borders' });
  const shadePath = s('path', { class: 'map-globe-shade', fill: 'url(#globe-shade)' });
  const radiusPath = s('path', { class: 'map-radius' });
  const routesLayer = s('g', { class: 'map-routes' });
  const zoomLayer = s('g', { class: 'map-zoom-layer' }, spherePath, graticulePath, landPath, bordersPath, shadePath, radiusPath, routesLayer);
  const pinsLayer = s('g', { class: 'map-pins' });
  const surface = s('svg', { class: 'map-surface', role: 'img', 'aria-label': t().map.surface }, s('defs', {}, halftone, globeShade), zoomLayer, pinsLayer);
  const canvas = h('canvas', { class: 'map-canvas', 'aria-hidden': 'true' });
  const highlightsLayer = s('g', { class: 'map-highlights' });
  const labelsLayer = s('g', { class: 'map-labels' });
  const meMarker = s('circle', { class: 'map-me', r: 6, hidden: true });
  const pointMarker = s(
    'g',
    { class: 'map-point', hidden: true },
    s('circle', { class: 'map-point-ring', r: 7 }),
    s('path', { class: 'map-point-cross', d: 'M-13 0H-7M7 0H13M0 -13V-7M0 7V13' }),
    s('circle', { class: 'map-point-dot', r: 2 }),
  );
  const tourHeadsLayer = s('g', { class: 'map-tour-heads' });
  const overlay = s('svg', { class: 'map-overlay', 'aria-hidden': 'true' }, labelsLayer, highlightsLayer, tourHeadsLayer, meMarker, pointMarker);
  const cursor = h('button', { type: 'button', class: 'map-cursor', 'aria-label': t().map.cursor });
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(surface, canvas, overlay, cursor, announcer);
  const tooltip = createTooltip(container);

  const context = context2d(canvas);
  const measureContext = context2d(h('canvas'));

  let width = 0;
  let height = 0;
  let base: MapFit | null = null;
  let transform: ZoomTransform = zoomIdentity;
  let props: MapProps | null = null;
  let groups: PinGroup[] = [];
  let pins: DisplayPin[] = [];
  let tree: Quadtree<DisplayPin> = quadtree<DisplayPin>();
  let useCanvas = false;
  let hoveredPinId: string | null = null;
  let cursorPinId: string | null = null;
  let animationFrame: number | null = null;
  let programmaticZoom = false;
  let tour: MapTour | null = null;
  let tourTime = 0;
  let tourLegs: readonly TourLeg[] = [];
  let pendingFit = false;
  const svgPins = new Map<string, SVGGElement>();
  const labelWidths = new Map<string, number>();

  const zoomBehavior = zoom<SVGSVGElement, unknown>()
    .filter((event: MouseEvent) => mode === 'flat' && (!event.ctrlKey || event.type === 'wheel') && !event.button)
    .scaleExtent([MAP_SETTINGS.minZoom, MAP_SETTINGS.maxZoom])
    .clickDistance(MAP_SETTINGS.clickDistancePx)
    .on('start', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (programmaticZoom) return;
      if (event.sourceEvent !== null) callbacks.onUserMove();
      cancelAnimation();
      tooltip.hide();
      labelsLayer.replaceChildren();
    })
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (programmaticZoom) return;
      transform = event.transform;
      applyZoomTransform();
    })
    .on('end', () => {
      if (!programmaticZoom) rebuildPins();
    });
  const surfaceSelection = select(surface);
  surfaceSelection.call(zoomBehavior);

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const nextWidth = Math.round(entry.contentRect.width);
    const nextHeight = Math.round(entry.contentRect.height);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    surface.setAttribute('width', String(width));
    surface.setAttribute('height', String(height));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    const ratio = window.devicePixelRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    refit();
  });
  resizeObserver.observe(container);

  surface.addEventListener('pointermove', (event) => {
    if (event.buttons !== 0 || picking) return;
    const pin = pinAt(event.offsetX, event.offsetY);
    surface.classList.toggle('is-over-pin', pin !== null);
    if ((pin?.id ?? null) === hoveredPinId) return;
    hoveredPinId = pin?.id ?? null;
    if (pin === null) tooltip.hide();
    else showPinTooltip(pin);
    callbacks.onHover(pin === null ? null : pin.shows);
  });
  surface.addEventListener('pointerleave', () => {
    tooltip.hide();
    if (hoveredPinId === null) return;
    hoveredPinId = null;
    callbacks.onHover(null);
  });
  surface.addEventListener('click', (event) => {
    if (globeDragged || longPressed) {
      globeDragged = false;
      longPressed = false;
      return;
    }
    if (picking) {
      const point = pointAt(event.clientX, event.clientY);
      if (point !== null) callbacks.onPickPoint(point);
      return;
    }
    const pin = pinAt(event.offsetX, event.offsetY);
    callbacks.onSelect(pin === null ? [] : pin.shows);
  });

  /** Touch and pen open the point menu by a long press; their native context menu (Android's comes sooner) is held back. */
  let lastPointerType = 'mouse';
  let longPress = IDLE_PRESS;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  /** The click that ends a long press must not open a pin. */
  let longPressed = false;
  const pressInput = (input: LongPressInput) => {
    const step = stepLongPress(longPress, input);
    longPress = step.state;
    if (longPress.press === null) clearTimeout(longPressTimer);
    if (step.fired === null) return;
    longPressed = true;
    openPointMenu(step.fired.x, step.fired.y, true);
  };
  surface.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType;
    longPressed = false;
    pressInput({ kind: 'down', pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, time: performance.now() });
    if (longPress.press?.pointerId !== event.pointerId) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => pressInput({ kind: 'tick', time: performance.now() }), LONG_PRESS.durationMs);
  });
  surface.addEventListener('pointermove', (event) => pressInput({ kind: 'move', pointerId: event.pointerId, x: event.clientX, y: event.clientY }));
  for (const type of ['pointerup', 'pointercancel'] as const) surface.addEventListener(type, (event) => pressInput({ kind: 'up', pointerId: event.pointerId }));
  surface.addEventListener('contextmenu', (event) => {
    if (lastPointerType !== 'mouse') {
      event.preventDefault();
      return;
    }
    if (openPointMenu(event.clientX, event.clientY, false)) event.preventDefault();
  });

  function openPointMenu(clientX: number, clientY: number, byTouch: boolean): boolean {
    const point = pointAt(clientX, clientY);
    if (point === null) return false;
    tooltip.hide();
    callbacks.onPointMenu(point, clientX, clientY, byTouch);
    return true;
  }

  /** The place under a spot of the window; null off the map (beside the globe or the flat map's outline). */
  function pointAt(clientX: number, clientY: number): LonLat | null {
    if (base === null) return null;
    const bounds = surface.getBoundingClientRect();
    const x = transform.invertX(clientX - bounds.left);
    const y = transform.invertY(clientY - bounds.top);
    const point = projection.invert?.([x, y]);
    if (point === undefined || point === null || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    const front = frontCenter();
    if (front !== null && geoDistance(front, point) > Math.PI / 2) return null;
    const back = projection(point);
    if (back === null || Math.hypot(back[0] - x, back[1] - y) > 1) return null;
    return [point[0], point[1]];
  }

  cursor.addEventListener('focus', () => {
    const pin = currentCursorPin() ?? pins[0];
    if (pin !== undefined) moveCursorTo(pin);
  });
  cursor.addEventListener('blur', () => {
    cursor.classList.remove('is-active');
    tooltip.hide();
    callbacks.onHover(null);
  });
  cursor.addEventListener('keydown', (event) => {
    const index = pins.findIndex((pin) => pin.id === cursorPinId);
    const step = (offset: number) => pins[Math.max(0, Math.min(pins.length - 1, index + offset))];
    const targets: Record<string, () => DisplayPin | undefined> = {
      ArrowRight: () => step(1),
      ArrowDown: () => step(1),
      ArrowLeft: () => step(-1),
      ArrowUp: () => step(-1),
      Home: () => pins[0],
      End: () => pins.at(-1),
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      const pin = target();
      if (pin !== undefined) moveCursorTo(pin);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const pin = currentCursorPin();
      const [first] = pin?.shows ?? [];
      if (picking && first !== undefined) callbacks.onPickPoint([first.show.geo.lon, first.show.geo.lat]);
      else if (pin !== undefined) callbacks.onSelect(pin.shows);
    } else if (event.key === '+' || event.key === '=') {
      zoomBy(1.6);
    } else if (event.key === '-') {
      zoomBy(1 / 1.6);
    }
  });

  function pinAt(x: number, y: number): DisplayPin | null {
    return tree.find(transform.invertX(x), transform.invertY(y), MAP_SETTINGS.hitRadiusPx / transform.k) ?? null;
  }

  function currentCursorPin(): DisplayPin | undefined {
    return pins.find((pin) => pin.id === cursorPinId);
  }

  function moveCursorTo(pin: DisplayPin) {
    cursorPinId = pin.id;
    positionCursor();
    const description = describePin(pin);
    cursor.setAttribute('aria-label', description);
    announcer.textContent = description;
    showPinTooltip(pin);
    callbacks.onHover(pin.shows);
  }

  function showPinTooltip(pin: DisplayPin) {
    if (props === null) return;
    tooltip.show(pinTooltip(pin.shows, pinLabel(pin), props.theme.mode), transform.applyX(pin.x), transform.applyY(pin.y));
  }

  function positionCursor() {
    const pin = currentCursorPin();
    cursor.classList.toggle('is-active', pin !== undefined && document.activeElement === cursor);
    if (pin === undefined) return;
    cursor.style.setProperty('--x', `${transform.applyX(pin.x)}px`);
    cursor.style.setProperty('--y', `${transform.applyY(pin.y)}px`);
  }

  function render(next: MapProps) {
    const previous = props;
    props = next;
    if (previous === null || previous.shows !== next.shows) {
      groups = groupByCoordinates(next.shows);
      useCanvas = next.shows.length > MAP_SETTINGS.canvasThreshold;
      container.classList.toggle('uses-canvas', useCanvas);
      if (useCanvas) clearSvgPins();
      if (base !== null) projectAndCluster();
    }
    if (base === null) return;
    const appearanceChanged =
      previous === null ||
      previous.shows !== next.shows ||
      previous.theme !== next.theme ||
      previous.focusBandId !== next.focusBandId ||
      previous.routeBandIds !== next.routeBandIds ||
      previous.emphasizedBandIds !== next.emphasizedBandIds;
    if (appearanceChanged) {
      renderRoutes();
      drawPins();
      placePinLabels();
    }
    drawHighlights();
  }

  /** What the last fit was asked to show; a resize repeats it. */
  let lastFit: { readonly kind: 'data' } | { readonly kind: 'points'; readonly points: readonly LonLat[]; readonly minSpanKm: number } = { kind: 'data' };

  function refit() {
    if (lastFit.kind === 'data') fitToData(false);
    else fitToPoints(lastFit.points, lastFit.minSpanKm, false);
  }

  function fitToData(animate: boolean) {
    lastFit = { kind: 'data' };
    if (props === null) {
      pendingFit = true;
      return;
    }
    fitShowsNow(props.fitShows, animate);
  }

  function fitShowsNow(shows: readonly ShowRef[], animate: boolean) {
    fitPointsNow(
      shows.map((ref): LonLat => [ref.show.geo.lon, ref.show.geo.lat]),
      MAP_SETTINGS.minSpanKm,
      animate,
    );
  }

  function fitToShows(shows: readonly ShowRef[], animate: boolean) {
    fitToPoints(
      shows.map((ref): LonLat => [ref.show.geo.lon, ref.show.geo.lat]),
      MAP_SETTINGS.minSpanKm,
      animate,
    );
  }

  function fitToPoints(points: readonly LonLat[], minSpanKm: number, animate: boolean) {
    lastFit = { kind: 'points', points, minSpanKm };
    fitPointsNow(points, minSpanKm, animate);
  }

  function fitPointsNow(points: readonly LonLat[], minSpanKm: number, animate: boolean) {
    if (props === null || width <= 2 * MAP_SETTINGS.padding || height <= 2 * MAP_SETTINGS.padding) {
      pendingFit = true;
      return;
    }
    pendingFit = false;
    const options = { width, height, padding: MAP_SETTINGS.padding, minSpanKm };
    const target = mode === 'flat' ? computeMapFit(points, options) : computeGlobeFit(points, options);
    globeFitRadius = Math.min(width, height) / 2 - MAP_SETTINGS.padding;
    const duration = mode === 'flat' ? MAP_SETTINGS.fitDurationMs : MAP_SETTINGS.globeFitDurationMs;
    cancelAnimation();
    const start = base === null ? null : flatten(base, transform);
    resetZoomTransform();
    if (start === null || !animate || prefersReducedMotion()) {
      applyBase(target);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      applyBase(interpolateFit(start, target, easeInOutCubic(t)), t < 1);
      animationFrame = t < 1 ? requestAnimationFrame(step) : null;
    };
    animationFrame = requestAnimationFrame(step);
  }

  function zoomBy(factor: number) {
    if (width === 0) return;
    if (mode === 'globe') {
      if (base !== null) applyBase(scaleGlobe(base, factor));
      return;
    }
    surfaceSelection.call(zoomBehavior.scaleBy, factor, [width / 2, height / 2]);
  }

  function scaleGlobe(fit: MapFit, factor: number): MapFit {
    const scale = Math.min(globeFitRadius * MAP_SETTINGS.globeMaxScale, Math.max(globeFitRadius * MAP_SETTINGS.globeMinScale, fit.scale * factor));
    return { ...fit, scale };
  }

  function setMode(next: MapMode) {
    if (next === mode) return;
    mode = next;
    cancelAnimation();
    resetZoomTransform();
    projection = next === 'flat' ? geoEqualEarth() : geoOrthographic().clipAngle(90);
    path = geoPath(projection);
    container.classList.toggle('is-globe', next === 'globe');
    base = null;
    fitToData(false);
  }

  function setAreaCircle(circle: AreaCircle | null) {
    areaCircle = circle;
    if (base !== null) applyBase(base);
  }

  function setPicking(next: boolean) {
    if (next === picking) return;
    picking = next;
    container.classList.toggle('is-picking', next);
    if (!next) return;
    tooltip.hide();
    hoveredPinId = null;
    surface.classList.remove('is-over-pin');
    callbacks.onHover(null);
  }

  let globeDrag: { readonly x: number; readonly y: number; readonly fit: MapFit } | null = null;
  /** d3-zoom swallows the click after a drag on the flat map; the globe turns by its own handlers, so it does that here. */
  let globeDragged = false;
  let globeSettle: ReturnType<typeof setTimeout> | undefined;

  surface.addEventListener('pointerdown', (event) => {
    globeDragged = false;
    if (mode !== 'globe' || event.button !== 0 || base === null) return;
    callbacks.onUserMove();
    cancelAnimation();
    tooltip.hide();
    globeDrag = { x: event.clientX, y: event.clientY, fit: base };
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', (event) => {
    if (mode !== 'globe' || globeDrag === null) return;
    if (Math.hypot(event.clientX - globeDrag.x, event.clientY - globeDrag.y) > MAP_SETTINGS.clickDistancePx) globeDragged = true;
    const degreesPerPixel = 180 / Math.PI / globeDrag.fit.scale;
    const [lambda, phi] = globeDrag.fit.rotate;
    const nextPhi = Math.max(-90, Math.min(90, phi - (event.clientY - globeDrag.y) * degreesPerPixel));
    applyBase({ ...globeDrag.fit, rotate: [lambda + (event.clientX - globeDrag.x) * degreesPerPixel, nextPhi, 0] }, true);
  });
  const endGlobeDrag = () => {
    if (globeDrag === null) return;
    globeDrag = null;
    if (base !== null) applyBase(base);
  };
  surface.addEventListener('pointerup', endGlobeDrag);
  surface.addEventListener('pointercancel', endGlobeDrag);
  surface.addEventListener(
    'wheel',
    (event) => {
      if (mode !== 'globe' || base === null) return;
      event.preventDefault();
      callbacks.onUserMove();
      applyBase(scaleGlobe(base, Math.exp(-event.deltaY * 0.002)), true);
      clearTimeout(globeSettle);
      globeSettle = setTimeout(() => {
        if (base !== null) applyBase(base);
      }, 150);
    },
    { passive: false },
  );

  function applyBase(fit: MapFit, inMotion = false) {
    base = fit;
    projection.rotate([...fit.rotate]).scale(fit.scale).translate([...fit.translate]).precision(inMotion ? 2 : 0.5);
    const sphere = path({ type: 'Sphere' }) ?? '';
    spherePath.setAttribute('d', sphere);
    shadePath.setAttribute('d', mode === 'globe' ? sphere : '');
    graticulePath.setAttribute('d', mode === 'globe' ? (path(geoGraticule10()) ?? '') : '');
    landPath.setAttribute('d', path(land) ?? '');
    bordersPath.setAttribute('d', path(borders) ?? '');
    radiusPath.setAttribute(
      'd',
      areaCircle === null ? '' : (path(geoCircle().center([areaCircle.lon, areaCircle.lat]).radius(radiusDegrees(areaCircle.radiusKm))()) ?? ''),
    );
    renderRoutes();
    projectAndCluster(inMotion);
  }

  function projectAndCluster(inMotion = false) {
    const front = frontCenter();
    const projected = groups.flatMap((group) => {
      if (front !== null && geoDistance(front, [group.lon, group.lat]) > Math.PI / 2) return [];
      const point = projection([group.lon, group.lat]);
      return point === null ? [] : [{ group, x: point[0], y: point[1] }];
    });
    pins = clusterGroups(projected, MAP_SETTINGS.clusterRadiusPx / transform.k).toSorted(
      (a, b) => a.firstStart - b.firstStart || (a.id < b.id ? -1 : 1),
    );
    tree = quadtree<DisplayPin>()
      .x((pin) => pin.x)
      .y((pin) => pin.y)
      .addAll(pins);
    drawPins();
    if (inMotion) labelsLayer.replaceChildren();
    else placePinLabels();
    drawHighlights();
    positionCursor();
    positionCentreMarker();
  }

  /** The point facing the viewer on the globe; null on the flat map, where everything is visible. */
  function frontCenter(): [number, number] | null {
    if (mode !== 'globe' || base === null) return null;
    return [-base.rotate[0], -base.rotate[1]];
  }

  /** The viewer's dot or the picked point's crosshair at the centre of the area. */
  function positionCentreMarker() {
    const front = frontCenter();
    const circle = areaCircle;
    const shown = circle !== null && (front === null || geoDistance(front, [circle.lon, circle.lat]) <= Math.PI / 2);
    const point = shown ? projection([circle.lon, circle.lat]) : null;
    meMarker.toggleAttribute('hidden', point === null || circle?.centre !== 'viewer');
    pointMarker.toggleAttribute('hidden', point === null || circle?.centre !== 'point');
    if (point === null) return;
    const x = transform.applyX(point[0]);
    const y = transform.applyY(point[1]);
    meMarker.setAttribute('cx', String(x));
    meMarker.setAttribute('cy', String(y));
    pointMarker.setAttribute('transform', `translate(${x},${y})`);
  }

  function rebuildPins() {
    if (base !== null) projectAndCluster();
  }

  function flatten(fit: MapFit, zoomTransform: ZoomTransform): MapFit {
    return {
      rotate: fit.rotate,
      scale: fit.scale * zoomTransform.k,
      translate: [fit.translate[0] * zoomTransform.k + zoomTransform.x, fit.translate[1] * zoomTransform.k + zoomTransform.y],
    };
  }

  function resetZoomTransform() {
    programmaticZoom = true;
    surfaceSelection.call(zoomBehavior.transform, zoomIdentity);
    programmaticZoom = false;
    transform = zoomIdentity;
    zoomLayer.removeAttribute('transform');
    halftone.removeAttribute('patternTransform');
    halftone.setAttribute('patternTransform', 'rotate(45)');
  }

  function applyZoomTransform() {
    zoomLayer.setAttribute('transform', transform.toString());
    halftone.setAttribute('patternTransform', `scale(${1 / transform.k}) rotate(45)`);
    positionPins();
    drawHighlights();
    positionCursor();
    positionCentreMarker();
    drawTour();
  }

  function cancelAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function renderRoutes() {
    if (props === null) return;
    const current = props;
    const routes = Map.groupBy(
      current.shows.filter((ref) => current.routeBandIds.has(ref.band.file.band.id) && ref.show.status !== 'cancelled'),
      (ref) => ref.band,
    );
    const legs: Omit<TourLeg, 'length'>[] = [];
    routesLayer.replaceChildren(
      ...[...routes.entries()].flatMap(([band, refs]) => {
        const stops = refs
          .toSorted((a, b) => a.start - b.start)
          .filter((ref, index, all) => index === 0 || ref.show.geo.lon !== all[index - 1]?.show.geo.lon || ref.show.geo.lat !== all[index - 1]?.show.geo.lat);
        if (stops.length < 2) return [];
        const dimmed = current.focusBandId !== null && current.focusBandId !== band.file.band.id;
        const emphasized = current.emphasizedBandIds.has(band.file.band.id);
        const attributes = { class: `map-route${dimmed ? ' is-dimmed' : ''}${emphasized ? ' is-emphasized' : ''}`, stroke: bandColor(band, current.theme.mode) };
        const line = (coordinates: [number, number][]) => path({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } } satisfies Feature<LineString | MultiLineString>) ?? '';
        const point = (ref: ShowRef): [number, number] => [ref.show.geo.lon, ref.show.geo.lat];
        if (tour === null || !tour.bandIds.has(band.file.band.id)) return [s('path', { ...attributes, d: line(stops.map(point)) })];
        const at = tour.at;
        return stops.slice(1).map((to, index) => {
          const from = stops[index] ?? to;
          const element = s('path', { ...attributes, d: line([point(from), point(to)]) });
          legs.push({ bandId: band.file.band.id, element, start: at(from.start), end: at(to.start) });
          return element;
        });
      }),
    );
    tourLegs = legs.map((leg) => ({ ...leg, length: leg.element.getTotalLength() }));
    drawTour();
  }

  /** Each leg grows from its first show to the next while the tour time passes their dates; a dot leads each band. */
  function drawTour() {
    if (tour === null) {
      tourHeadsLayer.replaceChildren();
      return;
    }
    const heads = new Map<string, SVGCircleElement>();
    for (const leg of tourLegs) {
      const progress = Math.min(1, Math.max(0, (tourTime - leg.start) / Math.max(1, leg.end - leg.start)));
      const dash = leg.length * transform.k;
      leg.element.style.strokeDasharray = `${dash} ${dash}`;
      leg.element.style.strokeDashoffset = `${dash * (1 - progress)}`;
      const onFarSide = leg.length === 0;
      if (progress > 0 && progress < 1 && !onFarSide && !heads.has(leg.bandId)) {
        const tip = leg.element.getPointAtLength(leg.length * progress);
        const stroke = leg.element.getAttribute('stroke') ?? '';
        heads.set(leg.bandId, s('circle', { class: 'map-tour-head', cx: transform.applyX(tip.x), cy: transform.applyY(tip.y), r: 6.5, fill: stroke }));
      }
    }
    tourHeadsLayer.replaceChildren(...heads.values());
  }

  function pinStyle(pin: DisplayPin, current: MapProps): PinStyle {
    const [onlyBand] = pin.bandIds.length === 1 ? pin.shows.map((ref) => ref.band) : [];
    const color = onlyBand === undefined ? current.theme.ink : bandColor(onlyBand, current.theme.mode);
    const inFocus = current.focusBandId === null || pin.bandIds.includes(current.focusBandId);
    const radius = pinRadius(pin);
    const opacity = inFocus ? 1 : 0.2;
    if (pin.allCancelled) return { radius, segments: [], fill: current.theme.stock, stroke: pin.allPast ? current.theme.past : color, strokeWidth: 2, opacity };
    if (pin.allPast) return { radius, segments: [], fill: current.theme.past, stroke: current.theme.stock, strokeWidth: 2, opacity: inFocus ? 1 : 0.2 };
    if (onlyBand === undefined) {
      const segments = pinSegments(pin.shows, current.theme.mode, current.theme.inkMuted);
      return { radius, segments, fill: current.theme.stock, stroke: current.theme.ink, strokeWidth: 1.25, opacity };
    }
    return { radius, segments: [], fill: color, stroke: current.theme.ink, strokeWidth: 1.25, opacity };
  }

  function drawPins() {
    if (props === null) return;
    if (useCanvas) drawCanvasPins(props);
    else drawSvgPins(props);
  }

  function clearSvgPins() {
    svgPins.clear();
    pinsLayer.replaceChildren();
  }

  function drawSvgPins(current: MapProps) {
    const seen = new Set<string>();
    for (const pin of pins) {
      seen.add(pin.id);
      const style = pinStyle(pin, current);
      let element = svgPins.get(pin.id);
      if (element === undefined) {
        element = s('g', { class: 'map-pin' }, s('circle'), s('g', { class: 'map-pin-ring' }), s('rect', { class: 'map-badge' }), s('text', { class: 'map-badge-text' }));
        svgPins.set(pin.id, element);
        pinsLayer.append(element);
      }
      const [circle, ring, badge, badgeText] = element.children;
      ring?.replaceChildren(
        ...style.segments.map((segment) =>
          s('path', {
            class: 'map-pin-segment',
            d: annularSectorPath(MAP_SETTINGS.mixedPinHole, style.radius - style.strokeWidth / 2, segment.startAngle, segment.endAngle),
            fill: segment.color,
          }),
        ),
      );
      circle?.setAttribute('r', String(style.radius));
      circle?.setAttribute('fill', style.fill);
      circle?.setAttribute('stroke', style.stroke);
      circle?.setAttribute('stroke-width', String(style.strokeWidth));
      element.setAttribute('opacity', String(style.opacity));
      const count = pin.shows.length;
      const label = count > 1 ? String(count) : '';
      const badgeWidth = 6 + label.length * 6;
      badge?.setAttribute('x', String(style.radius - 2));
      badge?.setAttribute('y', String(-style.radius - 12));
      badge?.setAttribute('width', String(badgeWidth));
      badge?.setAttribute('height', '12');
      badge?.toggleAttribute('hidden', count < 2);
      if (badgeText !== undefined) {
        badgeText.textContent = label;
        badgeText.setAttribute('x', String(style.radius - 2 + badgeWidth / 2));
        badgeText.setAttribute('y', String(-style.radius - 3));
      }
    }
    for (const [id, element] of svgPins) {
      if (seen.has(id)) continue;
      element.remove();
      svgPins.delete(id);
    }
    positionPins();
  }

  function positionPins() {
    if (useCanvas) {
      if (props !== null) drawCanvasPins(props);
      return;
    }
    for (const pin of pins) {
      svgPins.get(pin.id)?.setAttribute('transform', `translate(${transform.applyX(pin.x)},${transform.applyY(pin.y)})`);
    }
  }

  function drawCanvasPins(current: MapProps) {
    const ratio = canvas.width / Math.max(1, width);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    for (const pin of pins) {
      const x = transform.applyX(pin.x);
      const y = transform.applyY(pin.y);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
      const style = pinStyle(pin, current);
      context.globalAlpha = style.opacity;
      context.beginPath();
      context.arc(x, y, style.radius, 0, Math.PI * 2);
      context.fillStyle = style.fill;
      context.fill();
      for (const segment of style.segments) {
        context.beginPath();
        context.arc(x, y, style.radius, segment.startAngle, segment.endAngle);
        context.arc(x, y, MAP_SETTINGS.mixedPinHole, segment.endAngle, segment.startAngle, true);
        context.closePath();
        context.fillStyle = segment.color;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = current.theme.stock;
        context.stroke();
      }
      context.beginPath();
      context.arc(x, y, style.radius, 0, Math.PI * 2);
      context.lineWidth = style.strokeWidth;
      context.strokeStyle = style.stroke;
      context.stroke();
      if (pin.shows.length > 1) {
        const label = String(pin.shows.length);
        const badgeWidth = 6 + label.length * 6;
        context.fillStyle = current.theme.ink;
        context.fillRect(x + style.radius - 2, y - style.radius - 12, badgeWidth, 12);
        context.fillStyle = current.theme.stock;
        context.font = MAP_SETTINGS.badgeFont;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, x + style.radius - 2 + badgeWidth / 2, y - style.radius - 5.5);
      }
    }
    context.globalAlpha = 1;
  }

  function placePinLabels() {
    if (props === null) return;
    measureContext.font = MAP_SETTINGS.labelFont;
    const visible = pins.flatMap((pin) => {
      const x = transform.applyX(pin.x);
      const y = transform.applyY(pin.y);
      return x >= 0 && y >= 0 && x <= width && y <= height ? [{ pin, x, y }] : [];
    });
    const candidates = visible
      .toSorted((a, b) => b.pin.shows.length - a.pin.shows.length)
      .map(({ pin, x, y }) => {
        const text = pinLabel(pin);
        let textWidth = labelWidths.get(text);
        if (textWidth === undefined) {
          textWidth = measureContext.measureText(text).width;
          labelWidths.set(text, textWidth);
        }
        return { id: pin.id, text, x, y, width: textWidth, height: 14, pinRadius: pinRadius(pin) + 2 };
      });
    const obstacles = visible.map(({ pin, x, y }) => ({ id: pin.id, x, y, radius: MAP_SETTINGS.pinRadius + 2 }));
    const placed = placeLabels(candidates, obstacles, { width, height });
    labelsLayer.replaceChildren(
      ...placed.map((label) =>
        s('text', { class: 'map-label', x: label.left, y: label.top + label.height - 3 }, label.text),
      ),
    );
  }

  function drawHighlights() {
    if (props === null) return;
    const current = props;
    const rings: SVGCircleElement[] = [];
    const hovered: SVGCircleElement[] = [];
    for (const pin of pins) {
      const cx = transform.applyX(pin.x);
      const cy = transform.applyY(pin.y);
      if (pin.shows.some((ref) => current.selectedShowIds.has(ref.show.id))) rings.push(s('circle', { class: 'map-ring is-selected', cx, cy, r: pinRadius(pin) + 5 }));
      if (pin.shows.some((ref) => current.highlightedShowIds.has(ref.show.id))) {
        const r = pinRadius(pin) + MAP_SETTINGS.hoverRingGap;
        hovered.push(s('circle', { class: 'map-ring is-hovered-halo', cx, cy, r }), s('circle', { class: 'map-ring is-hovered', cx, cy, r }));
      }
    }
    highlightsLayer.replaceChildren(...rings, ...hovered);
  }

  function describePin(pin: DisplayPin): string {
    const listed = pin.shows.slice(0, 3).map((ref) => `${ref.band.file.band.name}, ${formatDate(ref.show.date)}`);
    return t().map.pin(pin.shows.length, pinLabel(pin), listed, Math.max(0, pin.shows.length - 3));
  }

  return {
    render(next) {
      render(next);
      if (pendingFit) refit();
    },
    fitToData,
    fitToShows,
    fitToPoints,
    zoomBy,
    setMode,
    setAreaCircle,
    setPicking,
    setTour(next) {
      tour = next;
      tourTime = 0;
      renderRoutes();
    },
    setTourTime(ms) {
      tourTime = ms;
      drawTour();
    },
  };
}

function pinRadius(pin: DisplayPin): number {
  if (pin.bandIds.length > 1 && !pin.allPast && !pin.allCancelled) return MAP_SETTINGS.mixedPinRadius;
  return pin.shows.length > 1 ? MAP_SETTINGS.multiPinRadius : MAP_SETTINGS.pinRadius;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
