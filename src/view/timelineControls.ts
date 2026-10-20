import { h, holdShrunkLayoutWidth, holdWidestOptionWidth } from './dom.ts';
import { iconButton } from './icons.ts';
import { IOS_ZOOM_GUARD_CLASS } from './iosZoomGuard.ts';
import { attachPopover } from './popover.ts';
import { createSwitch } from './switch.ts';
import { t } from '../i18n/index.ts';
import { PRESET_IDS, type TimePreset } from './timePresets.ts';
import type { TourPacing } from './tourClock.ts';

export interface TimelineControlsProps {
  /** Null after the user zoomed or panned to a range of their own. */
  readonly preset: TimePreset | null;
  /** Presets with shows of the shown bands, wherever they are; the pressed preset stays enabled regardless. */
  readonly availablePresets: ReadonlySet<TimePreset>;
  readonly followTimeline: boolean;
  readonly hideEmptyLanes: boolean;
  readonly includePastMonth: boolean;
  readonly tourPacing: TourPacing;
}

export interface TimelineControlsCallbacks {
  onPreset(preset: TimePreset): void;
  onZoomOut(): void;
  onShift(direction: -1 | 1): void;
  onFollowTimeline(follow: boolean): void;
  onHideEmptyLanes(hide: boolean): void;
  onIncludePastMonth(include: boolean): void;
  onTourPacing(pacing: TourPacing): void;
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
  const pills = PRESET_IDS.map((id) => {
    const { label, short } = t().timeline.presets[id];
    const pill = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', 'aria-label': label, title: label }, short);
    pill.addEventListener('click', () => callbacks.onPreset(id));
    return [id, pill] as const;
  });
  const pillGroup = h('div', { class: 'pills', role: 'group', 'aria-label': t().timeline.timeRange }, ...pills.map(([, pill]) => pill));

  const custom = h('option', { value: CUSTOM_RANGE, disabled: true, hidden: true }, t().timeline.customRange);
  const options = PRESET_IDS.map((id) => [id, h('option', { value: id }, t().timeline.presets[id].label)] as const);
  const select = h('select', { class: 'preset-select', 'aria-label': t().timeline.timeRange }, custom, ...options.map(([, option]) => option));
  select.addEventListener('change', () => {
    const preset = PRESET_IDS.find((id) => id === select.value);
    if (preset === undefined) throw new Error(`unknown time range ${select.value}`);
    callbacks.onPreset(preset);
  });

  const earlier = iconButton('chevron-left', t().timeline.earlier);
  const zoomOut = iconButton('zoom-out', t().timeline.zoomOut);
  const later = iconButton('chevron-right', t().timeline.later);
  earlier.addEventListener('click', () => callbacks.onShift(-1));
  later.addEventListener('click', () => callbacks.onShift(1));
  zoomOut.addEventListener('click', () => callbacks.onZoomOut());

  const { follow: followText, hideEmpty: hideEmptyText, pastMonth: pastMonthText, calendarPace: calendarPaceText } = t().timeline;
  const follow = createSwitch('option-follow', followText.label, followText.note, callbacks.onFollowTimeline);
  const hideEmpty = createSwitch('option-hide-empty', hideEmptyText.label, hideEmptyText.note, callbacks.onHideEmptyLanes);
  const pastMonth = createSwitch('option-past-month', pastMonthText.label, pastMonthText.note, callbacks.onIncludePastMonth);
  const calendarPace = createSwitch('option-calendar-pace', calendarPaceText.label, calendarPaceText.note, (byCalendar) =>
    callbacks.onTourPacing(byCalendar ? 'calendar' : 'even'),
  );
  const optionsButton = iconButton('sliders', t().timeline.options);
  const optionsPanel = h(
    'div',
    { class: 'popover timeline-popover timeline-options', id: 'timeline-options', role: 'dialog', 'aria-label': t().timeline.options },
    h('h2', { class: 'settings-title' }, t().timeline.optionsTitle),
    follow.row,
    hideEmpty.row,
    pastMonth.row,
    calendarPace.row,
  );
  attachPopover(optionsButton, optionsPanel);

  const info = iconButton('info', t().timeline.help);
  const help = h(
    'div',
    { class: 'popover timeline-popover timeline-help', id: 'timeline-help' },
    ...t().timeline.helpLines.map((line) => h('p', {}, line)),
  );
  attachPopover(info, help);

  container.append(
    pillGroup,
    select,
    h('div', { class: 'toolbar-group', role: 'group', 'aria-label': t().timeline.moveRange }, earlier, zoomOut, later),
    h('div', { class: 'toolbar-group timeline-bar-end' }, h('div', { class: 'popover-anchor' }, optionsButton, optionsPanel), h('div', { class: 'popover-anchor' }, info, help)),
  );
  holdWidestOptionWidth(select);
  if (document.documentElement.classList.contains(IOS_ZOOM_GUARD_CLASS)) holdShrunkLayoutWidth(select);

  return {
    render(props) {
      for (const [id, pill] of pills) {
        pill.setAttribute('aria-pressed', String(props.preset === id));
        pill.disabled = props.preset !== id && !props.availablePresets.has(id);
      }
      custom.hidden = props.preset !== null;
      for (const [id, option] of options) option.disabled = props.preset !== id && !props.availablePresets.has(id);
      const value = props.preset ?? CUSTOM_RANGE;
      if (select.value !== value) select.value = value;
      follow.set(props.followTimeline);
      hideEmpty.set(props.hideEmptyLanes);
      pastMonth.set(props.includePastMonth);
      calendarPace.set(props.tourPacing === 'calendar');
    },
  };
}
