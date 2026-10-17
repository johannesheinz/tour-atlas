import { h } from './dom.ts';
import type { MapMode } from './map.ts';
import { MAP_REGIONS, NEAR_ME_RADII_KM, findRegion, type MapViewPreset, type NearMeRadius } from './mapRegions.ts';

export interface MapControlsProps {
  readonly view: MapViewPreset;
  readonly mode: MapMode;
  /** Shown next to the menu: the nearby count or why the location is unavailable. */
  readonly status: string | null;
  readonly canListNearby: boolean;
}

export interface MapControlsCallbacks {
  onView(view: MapViewPreset): void;
  onMode(mode: MapMode): void;
  onListNearby(): void;
}

export interface MapControlsView {
  render(props: MapControlsProps): void;
}

export function viewKey(view: MapViewPreset): string {
  switch (view.kind) {
    case 'shows':
      return 'shows';
    case 'region':
      return `region:${view.region.id}`;
    case 'near':
      return `near:${view.radiusKm}`;
  }
}

function parseViewKey(key: string): MapViewPreset {
  if (key === 'shows') return { kind: 'shows' };
  const [kind, value] = key.split(':');
  if (kind === 'region' && value !== undefined) {
    const region = findRegion(value);
    if (region !== undefined) return { kind: 'region', region };
  }
  if (kind === 'near') {
    const radiusKm = NEAR_ME_RADII_KM.find((radius) => String(radius) === value);
    if (radiusKm !== undefined) return { kind: 'near', radiusKm: radiusKm satisfies NearMeRadius };
  }
  throw new Error(`unknown map view ${key}`);
}

export function createMapControls(container: HTMLElement, callbacks: MapControlsCallbacks): MapControlsView {
  const select = h(
    'select',
    { class: 'map-view-select', 'aria-label': 'Map view' },
    h('option', { value: 'shows' }, 'Fit to shows'),
    h('optgroup', { label: 'Near me' }, ...NEAR_ME_RADII_KM.map((radius) => h('option', { value: `near:${radius}` }, `Within ${radius} km`))),
    h('optgroup', { label: 'Regions' }, ...MAP_REGIONS.map((region) => h('option', { value: `region:${region.id}` }, region.label))),
  );
  select.addEventListener('change', () => callbacks.onView(parseViewKey(select.value)));

  const modeButtons = (['flat', 'globe'] as const).map((mode) => {
    const button = h('button', { type: 'button', class: 'segment', 'aria-pressed': 'false' }, mode === 'flat' ? 'Flat' : 'Globe');
    button.addEventListener('click', () => callbacks.onMode(mode));
    return [mode, button] as const;
  });
  const modes = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Map projection' }, ...modeButtons.map(([, button]) => button));

  const status = h('span', { class: 'map-status', 'aria-live': 'polite' });
  const list = h('button', { type: 'button', class: 'text-button', hidden: true }, 'List these shows');
  list.addEventListener('click', () => callbacks.onListNearby());

  container.append(h('div', { class: 'toolbar-group' }, select, modes), h('span', { class: 'toolbar-group' }, status, list));

  return {
    render(props) {
      const key = viewKey(props.view);
      if (select.value !== key) select.value = key;
      for (const [mode, button] of modeButtons) button.setAttribute('aria-pressed', String(props.mode === mode));
      status.textContent = props.status ?? '';
      list.hidden = !props.canListNearby;
    },
  };
}
