import { h } from './dom.ts';
import { TIME_PRESETS, type TimePreset } from './timePresets.ts';

export interface TimelineControlsProps {
  readonly preset: TimePreset | null;
  readonly availablePresets: ReadonlySet<TimePreset>;
  readonly includePastMonth: boolean;
  readonly hideEmptyLanes: boolean;
  readonly followTimeline: boolean;
}

export interface TimelineControlsCallbacks {
  onPreset(preset: TimePreset): void;
  onIncludePastMonth(include: boolean): void;
  onHideEmptyLanes(hide: boolean): void;
  onFollowTimeline(follow: boolean): void;
  onZoomOut(): void;
  onShift(direction: -1 | 1): void;
}

export interface TimelineControlsView {
  render(props: TimelineControlsProps): void;
}

export function createTimelineControls(container: HTMLElement, callbacks: TimelineControlsCallbacks): TimelineControlsView {
  const presetButtons = TIME_PRESETS.map(({ id, label, title }) => {
    const button = h('button', { type: 'button', class: 'segment', title, 'aria-pressed': 'false' }, label);
    button.addEventListener('click', () => callbacks.onPreset(id));
    return [id, button] as const;
  });
  const presets = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time window' }, ...presetButtons.map(([, button]) => button));

  const toggle = (label: string, title: string, onChange: (pressed: boolean) => void) => {
    const button = h('button', { type: 'button', class: 'button button-small', title, 'aria-pressed': 'false' }, label);
    button.addEventListener('click', () => onChange(button.getAttribute('aria-pressed') !== 'true'));
    return button;
  };
  const pastMonth = toggle('Include last month', 'Start the upcoming windows a month back, to follow a running tour', callbacks.onIncludePastMonth);
  const hideEmpty = toggle('Hide empty lanes', 'Collapse bands without a show in the window', callbacks.onHideEmptyLanes);
  const follow = toggle('Follow timeline', 'Show only the shows in the time window on the map', callbacks.onFollowTimeline);

  const earlier = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move the time window earlier' }, '\u25C0');
  const zoomOut = h('button', { type: 'button', class: 'button button-small' }, 'Zoom out');
  const later = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move the time window later' }, '\u25B6');
  earlier.addEventListener('click', () => callbacks.onShift(-1));
  later.addEventListener('click', () => callbacks.onShift(1));
  zoomOut.addEventListener('click', () => callbacks.onZoomOut());

  container.append(
    presets,
    pastMonth,
    h('div', { class: 'toolbar-group', role: 'group', 'aria-label': 'Move the time window' }, earlier, zoomOut, later),
    hideEmpty,
    follow,
  );

  return {
    render(props) {
      for (const [id, button] of presetButtons) {
        button.setAttribute('aria-pressed', String(props.preset === id));
        button.disabled = !props.availablePresets.has(id);
      }
      pastMonth.setAttribute('aria-pressed', String(props.includePastMonth));
      hideEmpty.setAttribute('aria-pressed', String(props.hideEmptyLanes));
      follow.setAttribute('aria-pressed', String(props.followTimeline));
    },
  };
}
