import { h } from './dom.ts';
import type { TooltipContent } from './tooltipContent.ts';

export interface Tooltip {
  /** x and y are in the container's coordinates: the point the tooltip describes. */
  show(content: TooltipContent, x: number, y: number): void;
  hide(): void;
}

const OFFSET = 14;

/** Visual only: the keyboard cursors already announce the same information to screen readers. */
export function createTooltip(container: HTMLElement): Tooltip {
  const element = h('div', { class: 'tooltip', 'aria-hidden': 'true', hidden: true });
  container.append(element);

  return {
    show(content, x, y) {
      const parts: HTMLElement[] = [
        h('p', { class: 'tooltip-title' }, content.title),
        h(
          'ul',
          { class: 'tooltip-lines' },
          ...content.lines.map((line) => {
            const swatch = line.color === null ? null : h('span', { class: 'tooltip-swatch' });
            swatch?.style.setProperty('--swatch', line.color ?? '');
            return h(
              'li',
              {},
              swatch,
              h('span', { class: 'tooltip-text' }, line.text),
              line.detail === null ? null : h('span', { class: 'tooltip-detail' }, line.detail),
            );
          }),
        ),
      ];
      if (content.more !== null) parts.push(h('p', { class: 'tooltip-more' }, content.more));
      element.replaceChildren(...parts);
      element.hidden = false;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const maxX = container.clientWidth - width - 4;
      const left = x + OFFSET + width > container.clientWidth ? x - OFFSET - width : x + OFFSET;
      const top = y - OFFSET - height < 0 ? y + OFFSET : y - OFFSET - height;
      element.style.setProperty('--left', `${Math.max(4, Math.min(maxX, left))}px`);
      element.style.setProperty('--top', `${Math.max(4, top)}px`);
    },
    hide() {
      element.hidden = true;
    },
  };
}
