import { h } from './dom.ts';
import { iconButton } from './icons.ts';
import { attachPopover } from './popover.ts';
import { TIME_PRESETS, type TimePreset } from './timePresets.ts';

export interface TimelineControlsProps {
  /** Null after the user zoomed or panned to a range of their own. */
  readonly preset: TimePreset | null;
  readonly availablePresets: ReadonlySet<TimePreset>;
}

export interface TimelineControlsCallbacks {
  onPreset(preset: TimePreset): void;
  onZoomOut(): void;
  onShift(direction: -1 | 1): void;
}

export interface TimelineControlsView {
  render(props: TimelineControlsProps): void;
}

const CUSTOM_RANGE = 'custom';

/** The bar between map and timeline: the time range, moving it, and how to use the timeline. */
export function createTimelineControls(container: HTMLElement, callbacks: TimelineControlsCallbacks): TimelineControlsView {
  const custom = h('option', { value: CUSTOM_RANGE, disabled: true, hidden: true }, 'Custom range');
  const options = TIME_PRESETS.map(({ id, label }) => [id, h('option', { value: id }, label)] as const);
  const select = h('select', { class: 'preset-select', 'aria-label': 'Time range' }, custom, ...options.map(([, option]) => option));
  select.addEventListener('change', () => {
    const preset = TIME_PRESETS.find(({ id }) => id === select.value);
    if (preset === undefined) throw new Error(`unknown time range ${select.value}`);
    callbacks.onPreset(preset.id);
  });

  const earlier = iconButton('chevron-left', 'Earlier');
  const zoomOut = iconButton('zoom-out', 'Zoom out');
  const later = iconButton('chevron-right', 'Later');
  earlier.addEventListener('click', () => callbacks.onShift(-1));
  later.addEventListener('click', () => callbacks.onShift(1));
  zoomOut.addEventListener('click', () => callbacks.onZoomOut());

  const info = iconButton('info', 'How to use the timeline');
  const help = h(
    'div',
    { class: 'popover timeline-help', id: 'timeline-help' },
    h('p', {}, 'Drag across the timeline to zoom into that range.'),
    h('p', {}, 'Double-click to zoom out. Scroll to see more bands.'),
    h('p', {}, 'Click a dot to list its show; hover to see it on the map.'),
  );
  attachPopover(info, help);

  container.append(
    select,
    h('div', { class: 'toolbar-group', role: 'group', 'aria-label': 'Move the time range' }, earlier, zoomOut, later),
    h('div', { class: 'timeline-help-anchor' }, info, help),
  );

  return {
    render(props) {
      custom.hidden = props.preset !== null;
      for (const [id, option] of options) option.disabled = !props.availablePresets.has(id);
      const value = props.preset ?? CUSTOM_RANGE;
      if (select.value !== value) select.value = value;
    },
  };
}
