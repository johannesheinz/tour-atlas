import { h } from './dom.ts';
import { icon, iconButton } from './icons.ts';
import { MAP_REGIONS, NEAR_ME_RADII, type MapMode, type MapViewPreset } from './mapRegions.ts';
import { attachPopover } from './popover.ts';
import { currentLocale, formats, t } from '../i18n/index.ts';

export interface MapControlsProps {
  readonly view: MapViewPreset;
  readonly mode: MapMode;
  /** Shown in the map's corner: the nearby count or why the location is unavailable. */
  readonly status: string | null;
  readonly canListNearby: boolean;
}

export interface MapControlsCallbacks {
  onZoom(factor: number): void;
  /** The corner button: fits the map to the shows, inside the area when one is active. */
  onFit(): void;
  onView(view: MapViewPreset): void;
  onMode(mode: MapMode): void;
  onListNearby(): void;
}

export interface MapControlsView {
  render(props: MapControlsProps): void;
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
  }
}

/** Icon buttons in the map's top-right corner, and the "near me" status in its bottom-left corner. */
export function createMapControls(controls: HTMLElement, statusBar: HTMLElement, callbacks: MapControlsCallbacks): MapControlsView {
  const zoomIn = iconButton('plus', t().map.zoomIn);
  const zoomOut = iconButton('minus', t().map.zoomOut);
  const fit = iconButton('fit', t().map.fit);
  const mode = h('button', { type: 'button', class: 'icon-button' });
  const viewButton = iconButton('locate', t().map.area);
  zoomIn.addEventListener('click', () => callbacks.onZoom(ZOOM_STEP));
  zoomOut.addEventListener('click', () => callbacks.onZoom(1 / ZOOM_STEP));
  fit.addEventListener('click', () => callbacks.onFit());

  const unit = currentLocale().distance;
  const viewMenu = h('div', { class: 'popover map-view-menu', id: 'map-view-menu', role: 'group', 'aria-label': t().map.areaMenu });
  const popover = attachPopover(viewButton, viewMenu);
  const choices: [string, HTMLButtonElement][] = [];
  const choice = (view: MapViewPreset, label: string) => {
    const button = h('button', { type: 'button', class: 'menu-item', 'aria-pressed': 'false' }, label);
    button.addEventListener('click', () => {
      popover.close(true);
      callbacks.onView(view);
    });
    choices.push([viewKey(view), button]);
    return button;
  };
  viewMenu.append(
    choice({ kind: 'shows' }, t().map.fit),
    h('p', { class: 'menu-heading' }, t().map.nearMe),
    h('div', { class: 'menu-chips' }, ...NEAR_ME_RADII[unit].map((value) => choice({ kind: 'near', radius: { value, unit } }, formats().distance(value, unit)))),
    h('p', { class: 'menu-heading' }, t().map.regions),
    ...MAP_REGIONS.map((region) => choice({ kind: 'region', region }, t().map.regionNames[region.id])),
  );

  let shownMode: MapMode | null = null;
  mode.addEventListener('click', () => callbacks.onMode(shownMode === 'globe' ? 'flat' : 'globe'));

  const status = h('span', { class: 'map-status', 'aria-live': 'polite' });
  const list = h('button', { type: 'button', class: 'text-button', hidden: true }, t().map.listNearby);
  list.addEventListener('click', () => callbacks.onListNearby());
  statusBar.append(status, list);

  controls.append(h('div', { class: 'map-control-stack' }, zoomIn, zoomOut, fit), h('div', { class: 'map-control-stack' }, mode, viewButton), viewMenu);

  return {
    render(props) {
      const key = viewKey(props.view);
      for (const [choiceKey, button] of choices) button.setAttribute('aria-pressed', String(choiceKey === key));
      viewButton.setAttribute('aria-pressed', String(props.view.kind !== 'shows'));
      if (shownMode !== props.mode) {
        shownMode = props.mode;
        const label = props.mode === 'globe' ? t().map.asFlat : t().map.asGlobe;
        mode.setAttribute('aria-label', label);
        mode.title = label;
        mode.replaceChildren(icon(props.mode === 'globe' ? 'flat' : 'globe'));
      }
      status.textContent = props.status ?? '';
      list.hidden = !props.canListNearby;
      statusBar.hidden = props.status === null && !props.canListNearby;
    },
  };
}
