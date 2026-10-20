import { h } from './dom.ts';
import { icon, iconButton } from './icons.ts';
import type { LonLat } from './geoFit.ts';
import { MAP_REGIONS, NEAR_ME_RADII, type Distance, type MapMode, type MapViewPreset } from './mapRegions.ts';
import { attachFloatingPopover, attachPopover } from './popover.ts';
import { currentLocale, formats, t } from '../i18n/index.ts';

export interface MapControlsProps {
  readonly view: MapViewPreset;
  readonly mode: MapMode;
  /** Shown in the map's corner: the nearby count or why the location is unavailable. */
  readonly status: string | null;
  readonly canListNearby: boolean;
  /** An area (Near me or a picked point) limits the views, so the corner offers to clear it. */
  readonly canClearArea: boolean;
  /** The map waits for a click to set the centre of an area. */
  readonly picking: boolean;
}

export interface MapControlsCallbacks {
  onZoom(factor: number): void;
  /** The corner button: fits the map to the shows, inside the area when one is active. */
  onFit(): void;
  onView(view: MapViewPreset): void;
  onMode(mode: MapMode): void;
  onListNearby(): void;
  /** A radius under "Around a point": picks a centre on the map, or changes the radius of the picked one. */
  onAroundPoint(radius: Distance): void;
  onPickAnother(): void;
  onCancelPick(): void;
  onClearArea(): void;
  /** A radius in the menu that a right click or long press opened at that point. */
  onAroundHere(point: LonLat, radius: Distance): void;
}

export interface MapControlsView {
  render(props: MapControlsProps): void;
  /** Opens the radius choices at a spot of the window, for the area around the point there. */
  openPointMenu(point: LonLat, clientX: number, clientY: number, byTouch: boolean): void;
}

const ZOOM_STEP = 1.6;

export function viewKey(view: MapViewPreset): string {
  switch (view.kind) {
    case 'shows':
      return 'shows';
    case 'region':
      return `region:${view.region.id}`;
    case 'near':
      return `near:${view.radius.value}${view.radius.unit}`;
    case 'point':
      return `point:${view.radius.value}${view.radius.unit}`;
  }
}

/** Icon buttons in the map's top-right corner, and the area status in its bottom-left corner. */
export function createMapControls(controls: HTMLElement, statusBar: HTMLElement, callbacks: MapControlsCallbacks): MapControlsView {
  const frame = controls.parentElement;
  if (frame === null) throw new Error('the map controls need the map frame around them');
  const zoomIn = iconButton('plus', t().map.zoomIn);
  const zoomOut = iconButton('minus', t().map.zoomOut);
  const fit = iconButton('fit', t().map.fit);
  const mode = h('button', { type: 'button', class: 'icon-button' });
  const viewButton = iconButton('locate', t().map.area);
  zoomIn.addEventListener('click', () => callbacks.onZoom(ZOOM_STEP));
  zoomOut.addEventListener('click', () => callbacks.onZoom(1 / ZOOM_STEP));
  fit.addEventListener('click', () => callbacks.onFit());

  const unit = currentLocale().distance;
  const radii = NEAR_ME_RADII[unit].map((value): Distance => ({ value, unit }));
  const viewMenu = h('div', { class: 'popover map-view-menu', id: 'map-view-menu', role: 'group', 'aria-label': t().map.areaMenu });
  const popover = attachPopover(viewButton, viewMenu);
  const choices: [string, HTMLButtonElement][] = [];
  const menuItem = (key: string, label: string, choose: () => void) => {
    const button = h('button', { type: 'button', class: 'menu-item', 'aria-pressed': 'false' }, label);
    button.addEventListener('click', () => {
      popover.close(true);
      choose();
    });
    choices.push([key, button]);
    return button;
  };
  const choice = (view: MapViewPreset, label: string) => menuItem(viewKey(view), label, () => callbacks.onView(view));
  const pickAnother = h('button', { type: 'button', class: 'menu-item', hidden: true }, t().map.pickAnother);
  pickAnother.addEventListener('click', () => {
    popover.close(false);
    callbacks.onPickAnother();
  });
  viewMenu.append(
    choice({ kind: 'shows' }, t().map.fit),
    h('p', { class: 'menu-heading' }, t().map.nearMe),
    h('div', { class: 'menu-chips' }, ...radii.map((radius) => choice({ kind: 'near', radius }, formats().distance(radius.value, radius.unit)))),
    h('p', { class: 'menu-heading' }, t().map.aroundPoint),
    h(
      'div',
      { class: 'menu-chips' },
      ...radii.map((radius) => menuItem(`point:${radius.value}${radius.unit}`, formats().distance(radius.value, radius.unit), () => callbacks.onAroundPoint(radius))),
    ),
    pickAnother,
    h('p', { class: 'menu-heading' }, t().map.regions),
    ...MAP_REGIONS.map((region) => choice({ kind: 'region', region }, t().map.regionNames[region.id])),
  );

  const pointMenu = h('div', { class: 'popover map-point-menu', role: 'group', 'aria-label': t().map.aroundHere });
  const pointPopover = attachFloatingPopover(pointMenu);
  let menuPoint: LonLat | null = null;
  pointMenu.append(
    h('p', { class: 'menu-heading' }, t().map.aroundHere),
    h(
      'div',
      { class: 'menu-chips' },
      ...radii.map((radius) => {
        const button = h('button', { type: 'button', class: 'menu-item' }, formats().distance(radius.value, radius.unit));
        button.addEventListener('click', () => {
          if (menuPoint === null) throw new Error('the point menu is open without a point');
          const point = menuPoint;
          pointPopover.close(false);
          callbacks.onAroundHere(point, radius);
        });
        return button;
      }),
    ),
  );

  let shownMode: MapMode | null = null;
  mode.addEventListener('click', () => callbacks.onMode(shownMode === 'globe' ? 'flat' : 'globe'));

  const status = h('span', { class: 'map-status', 'aria-live': 'polite' });
  const list = h('button', { type: 'button', class: 'text-button', hidden: true }, t().map.listNearby);
  list.addEventListener('click', () => callbacks.onListNearby());
  const cancel = h('button', { type: 'button', class: 'text-button', hidden: true }, t().map.cancelPick);
  cancel.addEventListener('click', () => callbacks.onCancelPick());
  const clear = h('button', { type: 'button', class: 'map-status-clear', hidden: true, 'aria-label': t().map.clearArea, title: t().map.clearArea }, icon('close'));
  clear.addEventListener('click', () => {
    callbacks.onClearArea();
    viewButton.focus();
  });
  statusBar.append(status, list, cancel, clear);

  controls.append(h('div', { class: 'map-control-stack' }, zoomIn, zoomOut, fit), h('div', { class: 'map-control-stack' }, mode, viewButton), viewMenu);
  frame.append(pointMenu);

  return {
    render(props) {
      const key = viewKey(props.view);
      for (const [choiceKey, button] of choices) button.setAttribute('aria-pressed', String(choiceKey === key));
      viewButton.setAttribute('aria-pressed', String(props.view.kind !== 'shows'));
      pickAnother.hidden = props.view.kind !== 'point';
      if (shownMode !== props.mode) {
        shownMode = props.mode;
        const label = props.mode === 'globe' ? t().map.asFlat : t().map.asGlobe;
        mode.setAttribute('aria-label', label);
        mode.title = label;
        mode.replaceChildren(icon(props.mode === 'globe' ? 'flat' : 'globe'));
      }
      status.textContent = props.picking ? t().map.pickHint : (props.status ?? '');
      list.hidden = props.picking || !props.canListNearby;
      cancel.hidden = !props.picking;
      clear.hidden = props.picking || !props.canClearArea;
      statusBar.hidden = !props.picking && props.status === null && !props.canListNearby && !props.canClearArea;
    },
    openPointMenu(point, clientX, clientY, byTouch) {
      menuPoint = point;
      pointPopover.open(!byTouch, clientX, clientY);
    },
  };
}
