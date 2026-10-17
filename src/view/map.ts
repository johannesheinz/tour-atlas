import { geoEqualEarth, geoPath } from 'd3-geo';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import type { Feature, LineString, MultiLineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { WorldTopology } from '../data/countryLocator.ts';
import type { ShowRef } from '../model.ts';
import { h, prefersReducedMotion, s } from './dom.ts';
import { formatDate, plural } from './format.ts';
import { computeMapFit, interpolateFit, type LonLat, type MapFit } from './geoFit.ts';
import { placeLabels } from './labels.ts';
import { clusterGroups, groupByCoordinates, pinLabel, type DisplayPin, type PinGroup } from './pins.ts';
import { bandColor, type ThemeColors } from './theme.ts';

export const MAP_SETTINGS = {
  padding: 32,
  minSpanKm: 300,
  canvasThreshold: 2000,
  clusterRadiusPx: 12,
  pinRadius: 5,
  multiPinRadius: 7,
  hitRadiusPx: 12,
  minZoom: 0.5,
  maxZoom: 40,
  fitDurationMs: 300,
  maxBandsWithRoutes: 8,
  labelFont: '600 12px Archivo, system-ui, sans-serif',
  badgeFont: '600 10px Archivo, system-ui, sans-serif',
} as const;

export interface MapProps {
  /** All shows of visible bands. */
  readonly shows: readonly ShowRef[];
  /** The shows the map fits to (the timeline window when following it). */
  readonly fitShows: readonly ShowRef[];
  /** Shows outside the followed timeline window are drawn faint. Null: no window. */
  readonly isInWindow: ((ref: ShowRef) => boolean) | null;
  readonly routeBandIds: ReadonlySet<string>;
  readonly highlightedShowIds: ReadonlySet<string>;
  readonly selectedShowIds: ReadonlySet<string>;
  readonly focusBandId: string | null;
  readonly theme: ThemeColors;
}

export interface MapCallbacks {
  onHover(shows: readonly ShowRef[] | null): void;
  onSelect(shows: readonly ShowRef[]): void;
}

export interface MapView {
  render(props: MapProps): void;
  fitToData(animate: boolean): void;
  zoomBy(factor: number): void;
}

interface PinStyle {
  readonly radius: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
}

export function createMapView(container: HTMLElement, world: WorldTopology, callbacks: MapCallbacks): MapView {
  const land = feature(world, world.objects.land);
  const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
  const projection = geoEqualEarth();
  const path = geoPath(projection);

  const halftoneDot = s('circle', { class: 'halftone-dot', cx: 2, cy: 2, r: 1.15 });
  const halftone = s('pattern', { id: 'halftone', patternUnits: 'userSpaceOnUse', width: 4, height: 4 }, halftoneDot);
  const spherePath = s('path', { class: 'map-sphere' });
  const landPath = s('path', { class: 'map-land', fill: 'url(#halftone)' });
  const bordersPath = s('path', { class: 'map-borders' });
  const routesLayer = s('g', { class: 'map-routes' });
  const zoomLayer = s('g', { class: 'map-zoom-layer' }, spherePath, landPath, bordersPath, routesLayer);
  const pinsLayer = s('g', { class: 'map-pins' });
  const surface = s('svg', { class: 'map-surface', role: 'img', 'aria-label': 'World map of tour dates' }, s('defs', {}, halftone), zoomLayer, pinsLayer);
  const canvas = h('canvas', { class: 'map-canvas', 'aria-hidden': 'true' });
  const highlightsLayer = s('g', { class: 'map-highlights' });
  const labelsLayer = s('g', { class: 'map-labels' });
  const overlay = s('svg', { class: 'map-overlay', 'aria-hidden': 'true' }, labelsLayer, highlightsLayer);
  const cursor = h('button', { type: 'button', class: 'map-cursor', 'aria-label': 'Map pins. Use the arrow keys to move between shows.' });
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(surface, canvas, overlay, cursor, announcer);

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
  let pendingFit = false;
  const svgPins = new Map<string, SVGGElement>();
  const labelWidths = new Map<string, number>();

  const zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([MAP_SETTINGS.minZoom, MAP_SETTINGS.maxZoom])
    .clickDistance(5)
    .on('start', () => {
      if (programmaticZoom) return;
      cancelAnimation();
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
    fitToData(false);
  });
  resizeObserver.observe(container);

  surface.addEventListener('pointermove', (event) => {
    if (event.buttons !== 0) return;
    const pin = pinAt(event.offsetX, event.offsetY);
    surface.classList.toggle('is-over-pin', pin !== null);
    if ((pin?.id ?? null) === hoveredPinId) return;
    hoveredPinId = pin?.id ?? null;
    callbacks.onHover(pin === null ? null : pin.shows);
  });
  surface.addEventListener('pointerleave', () => {
    if (hoveredPinId === null) return;
    hoveredPinId = null;
    callbacks.onHover(null);
  });
  surface.addEventListener('click', (event) => {
    const pin = pinAt(event.offsetX, event.offsetY);
    callbacks.onSelect(pin === null ? [] : pin.shows);
  });

  cursor.addEventListener('focus', () => {
    const pin = currentCursorPin() ?? pins[0];
    if (pin !== undefined) moveCursorTo(pin);
  });
  cursor.addEventListener('blur', () => {
    cursor.classList.remove('is-active');
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
      if (pin !== undefined) callbacks.onSelect(pin.shows);
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
    callbacks.onHover(pin.shows);
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
      previous.isInWindow !== next.isInWindow ||
      previous.routeBandIds !== next.routeBandIds;
    if (appearanceChanged) {
      renderRoutes();
      drawPins();
      placePinLabels();
    }
    drawHighlights();
  }

  function fitToData(animate: boolean) {
    if (props === null || width <= 2 * MAP_SETTINGS.padding || height <= 2 * MAP_SETTINGS.padding) {
      pendingFit = true;
      return;
    }
    pendingFit = false;
    const points: LonLat[] = props.fitShows.map((ref) => [ref.show.geo.lon, ref.show.geo.lat]);
    const target = computeMapFit(points, { width, height, padding: MAP_SETTINGS.padding, minSpanKm: MAP_SETTINGS.minSpanKm });
    cancelAnimation();
    const start = base === null ? null : flatten(base, transform);
    resetZoomTransform();
    if (start === null || !animate || prefersReducedMotion()) {
      applyBase(target);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / MAP_SETTINGS.fitDurationMs);
      applyBase(interpolateFit(start, target, easeInOutCubic(t)), t < 1);
      animationFrame = t < 1 ? requestAnimationFrame(step) : null;
    };
    animationFrame = requestAnimationFrame(step);
  }

  function zoomBy(factor: number) {
    if (width === 0) return;
    surfaceSelection.call(zoomBehavior.scaleBy, factor, [width / 2, height / 2]);
  }

  function applyBase(fit: MapFit, inMotion = false) {
    base = fit;
    projection.rotate([...fit.rotate]).scale(fit.scale).translate([...fit.translate]).precision(inMotion ? 2 : 0.5);
    spherePath.setAttribute('d', path({ type: 'Sphere' }) ?? '');
    landPath.setAttribute('d', path(land) ?? '');
    bordersPath.setAttribute('d', path(borders) ?? '');
    renderRoutes();
    projectAndCluster(inMotion);
  }

  function projectAndCluster(inMotion = false) {
    const projected = groups.flatMap((group) => {
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
  }

  function cancelAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function renderRoutes() {
    if (props === null) return;
    const current = props;
    const routes = Map.groupBy(
      current.shows.filter((ref) => current.routeBandIds.has(ref.band.file.band.id) && ref.show.status !== 'cancelled' && (current.isInWindow?.(ref) ?? true)),
      (ref) => ref.band,
    );
    routesLayer.replaceChildren(
      ...[...routes.entries()].flatMap(([band, refs]) => {
        const coordinates = refs
          .toSorted((a, b) => a.start - b.start)
          .map((ref): [number, number] => [ref.show.geo.lon, ref.show.geo.lat])
          .filter((point, index, all) => index === 0 || point[0] !== all[index - 1]?.[0] || point[1] !== all[index - 1]?.[1]);
        if (coordinates.length < 2) return [];
        const route: Feature<LineString | MultiLineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
        const dimmed = current.focusBandId !== null && current.focusBandId !== band.file.band.id;
        return [s('path', { class: dimmed ? 'map-route is-dimmed' : 'map-route', d: path(route) ?? '', stroke: bandColor(band, current.theme.mode) })];
      }),
    );
  }

  function pinStyle(pin: DisplayPin, current: MapProps): PinStyle {
    const [onlyBand] = pin.bandIds.length === 1 ? pin.shows.map((ref) => ref.band) : [];
    const color = onlyBand === undefined ? current.theme.ink : bandColor(onlyBand, current.theme.mode);
    const inWindow = current.isInWindow === null || pin.shows.some(current.isInWindow);
    const inFocus = current.focusBandId === null || pin.bandIds.includes(current.focusBandId);
    const radius = pin.shows.length > 1 ? MAP_SETTINGS.multiPinRadius : MAP_SETTINGS.pinRadius;
    const opacity = (inWindow ? 1 : 0.25) * (inFocus ? 1 : 0.2);
    if (pin.allCancelled) return { radius, fill: current.theme.stock, stroke: pin.allPast ? current.theme.past : color, strokeWidth: 2, opacity };
    if (pin.allPast) return { radius, fill: current.theme.past, stroke: current.theme.inkMuted, strokeWidth: 1.25, opacity };
    return { radius, fill: color, stroke: current.theme.ink, strokeWidth: 1.25, opacity };
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
        element = s('g', { class: 'map-pin' }, s('circle'), s('rect', { class: 'map-badge' }), s('text', { class: 'map-badge-text' }));
        svgPins.set(pin.id, element);
        pinsLayer.append(element);
      }
      const [circle, badge, badgeText] = element.children;
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
        const radius = pin.shows.length > 1 ? MAP_SETTINGS.multiPinRadius : MAP_SETTINGS.pinRadius;
        return { id: pin.id, text, x, y, width: textWidth, height: 14, pinRadius: radius + 2 };
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
    const rings = pins.flatMap((pin) => {
      const selected = pin.shows.some((ref) => current.selectedShowIds.has(ref.show.id));
      const highlighted = pin.shows.some((ref) => current.highlightedShowIds.has(ref.show.id));
      if (!selected && !highlighted) return [];
      const radius = (pin.shows.length > 1 ? MAP_SETTINGS.multiPinRadius : MAP_SETTINGS.pinRadius) + (selected ? 5 : 4);
      return [
        s('circle', {
          class: selected ? 'map-ring is-selected' : 'map-ring',
          cx: transform.applyX(pin.x),
          cy: transform.applyY(pin.y),
          r: radius,
        }),
      ];
    });
    highlightsLayer.replaceChildren(...rings);
  }

  function describePin(pin: DisplayPin): string {
    const listed = pin.shows.slice(0, 3).map((ref) => `${ref.band.file.band.name}, ${formatDate(ref.show.date)}`);
    const more = pin.shows.length > 3 ? `, and ${pin.shows.length - 3} more` : '';
    return `${plural(pin.shows.length, 'show')} in ${pinLabel(pin)}: ${listed.join('; ')}${more}. Press Enter for details.`;
  }

  return {
    render(next) {
      render(next);
      if (pendingFit) fitToData(false);
    },
    fitToData,
    zoomBy,
  };
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas is not available');
  return context;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
