import { h } from './dom.ts';
import { iconButton } from './icons.ts';
import { attachPopover } from './popover.ts';
import { createSwitch } from './switch.ts';
import { TIME_PRESETS, type TimePreset } from './timePresets.ts';

export interface TimelineControlsProps {
  /** Null after the user zoomed or panned to a range of their own. */
  readonly preset: TimePreset | null;
  readonly availablePresets: ReadonlySet<TimePreset>;
  readonly followTimeline: boolean;
  readonly hideEmptyLanes: boolean;
  readonly includePastMonth: boolean;
}

export interface TimelineControlsCallbacks {
  onPreset(preset: TimePreset): void;
  onZoomOut(): void;
  onShift(direction: -1 | 1): void;
  onFollowTimeline(follow: boolean): void;
  onHideEmptyLanes(hide: boolean): void;
  onIncludePastMonth(include: boolean): void;
}

export interface TimelineControlsView {
  render(props: TimelineControlsProps): void;
}

const CUSTOM_RANGE = 'custom';

/**
 * The bar between map and timeline: the time range (pills on wide screens, a dropdown on narrow ones),
 * moving it, the map and timeline options, and how to use the timeline.
 */
export function createTimelineControls(container: HTMLElement, callbacks: TimelineControlsCallbacks): TimelineControlsView {
  const pills = TIME_PRESETS.map(({ id, label, short }) => {
    const pill = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', 'aria-label': label, title: label }, short);
    pill.addEventListener('click', () => callbacks.onPreset(id));
    return [id, pill] as const;
  });
  const pillGroup = h('div', { class: 'pills', role: 'group', 'aria-label': 'Time range' }, ...pills.map(([, pill]) => pill));

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

  const follow = createSwitch('option-follow', 'Follow timeline', 'The map shows only the shows in the time range.', callbacks.onFollowTimeline);
  const hideEmpty = createSwitch('option-hide-empty', 'Hide bands without shows', 'Bands without shows in the time range collapse in the band list and on the timeline.', callbacks.onHideEmptyLanes);
  const pastMonth = createSwitch('option-past-month', 'Include last month', 'Upcoming ranges start a month back, to follow a running tour.', callbacks.onIncludePastMonth);
  const optionsButton = iconButton('sliders', 'Map and timeline options');
  const optionsPanel = h(
    'div',
    { class: 'popover timeline-popover timeline-options', id: 'timeline-options', role: 'dialog', 'aria-label': 'Map and timeline options' },
    h('h2', { class: 'settings-title' }, 'Map and timeline'),
    follow.row,
    hideEmpty.row,
    pastMonth.row,
  );
  attachPopover(optionsButton, optionsPanel);

  const info = iconButton('info', 'How to use the timeline');
  const help = h(
    'div',
    { class: 'popover timeline-popover timeline-help', id: 'timeline-help' },
    h('p', {}, 'Drag across the timeline to zoom into that range.'),
    h('p', {}, 'Double-click to zoom out. Scroll to see more bands.'),
    h('p', {}, 'Click a dot to list its show; hover to see it on the map.'),
  );
  attachPopover(info, help);

  container.append(
    pillGroup,
    select,
    h('div', { class: 'toolbar-group', role: 'group', 'aria-label': 'Move the time range' }, earlier, zoomOut, later),
    h('div', { class: 'toolbar-group timeline-bar-end' }, h('div', { class: 'popover-anchor' }, optionsButton, optionsPanel), h('div', { class: 'popover-anchor' }, info, help)),
  );

  return {
    render(props) {
      for (const [id, pill] of pills) {
        pill.setAttribute('aria-pressed', String(props.preset === id));
        pill.disabled = !props.availablePresets.has(id);
      }
      custom.hidden = props.preset !== null;
      for (const [id, option] of options) option.disabled = !props.availablePresets.has(id);
      const value = props.preset ?? CUSTOM_RANGE;
      if (select.value !== value) select.value = value;
      follow.set(props.followTimeline);
      hideEmpty.set(props.hideEmptyLanes);
      pastMonth.set(props.includePastMonth);
    },
  };
}
