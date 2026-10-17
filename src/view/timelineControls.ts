import { h } from './dom.ts';
import { TIME_PRESETS, type TimePreset } from './timePresets.ts';

export interface TimelineControlsProps {
  readonly preset: TimePreset | null;
  readonly availablePresets: ReadonlySet<TimePreset>;
  readonly hideEmptyLanes: boolean;
  readonly followTimeline: boolean;
}

export interface TimelineControlsCallbacks {
  onPreset(preset: TimePreset): void;
  onHideEmptyLanes(hide: boolean): void;
  onFollowTimeline(follow: boolean): void;
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
  const hideEmpty = h('button', { type: 'button', class: 'button button-small', 'aria-pressed': 'true' }, 'Hide empty lanes');
  const follow = h('button', { type: 'button', class: 'button button-small', 'aria-pressed': 'true' }, 'Follow timeline');
  hideEmpty.addEventListener('click', () => callbacks.onHideEmptyLanes(hideEmpty.getAttribute('aria-pressed') !== 'true'));
  follow.addEventListener('click', () => callbacks.onFollowTimeline(follow.getAttribute('aria-pressed') !== 'true'));
  container.append(presets, hideEmpty, follow);

  return {
    render(props) {
      for (const [id, button] of presetButtons) {
        button.setAttribute('aria-pressed', String(props.preset === id));
        button.disabled = !props.availablePresets.has(id);
      }
      hideEmpty.setAttribute('aria-pressed', String(props.hideEmptyLanes));
      follow.setAttribute('aria-pressed', String(props.followTimeline));
    },
  };
}
