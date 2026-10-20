/** A rectangle in px of the window. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly left: number;
  readonly top: number;
  /** Set when the panel is taller than the window leaves room for; it then scrolls. */
  readonly maxHeight: number | null;
}

/** Popovers keep this distance from the window's edges. */
export const POPOVER_VIEWPORT_MARGIN_PX = 8;

/**
 * Where a panel goes so all of it is in the window. `panel` is where its stylesheet put it next to `anchor`
 * (the box it is positioned in): a panel that runs out of the window on that side flips to the other side when
 * it fits there, and then shifts along both axes until it is inside, shrinking only when the window is too short.
 */
export function placeInViewport(panel: Box, anchor: Box, viewport: { readonly width: number; readonly height: number }, margin: number): Placement {
  for (const [name, value] of Object.entries({ ...panel, ...viewport, margin })) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be a number, is ${value}`);
  }
  const roomHeight = viewport.height - 2 * margin;
  const roomWidth = viewport.width - 2 * margin;
  if (roomHeight <= 0 || roomWidth <= 0) throw new RangeError(`a ${viewport.width}×${viewport.height} window has no room for a popover`);
  const height = Math.min(panel.height, roomHeight);
  const vertical = flipped(
    { start: panel.top, size: height },
    { start: anchor.top, size: anchor.height },
    { start: margin, end: viewport.height - margin },
  );
  const horizontal = flipped(
    { start: panel.left, size: panel.width },
    { start: anchor.left, size: anchor.width },
    { start: margin, end: viewport.width - margin },
  );
  return {
    left: clamp(horizontal, margin, viewport.width - margin - panel.width),
    top: clamp(vertical, margin, viewport.height - margin - height),
    maxHeight: height < panel.height ? height : null,
  };
}

interface Span {
  readonly start: number;
  readonly size: number;
}

/** The panel's start along one axis, moved to the anchor's other side when it overflows on its own and fits there. */
function flipped(panel: Span, anchor: Span, room: { readonly start: number; readonly end: number }): number {
  const panelEnd = panel.start + panel.size;
  const anchorEnd = anchor.start + anchor.size;
  if (panel.start >= anchorEnd && panelEnd > room.end) {
    const gap = panel.start - anchorEnd;
    const before = anchor.start - gap - panel.size;
    return before >= room.start ? before : panel.start;
  }
  if (panelEnd <= anchor.start && panel.start < room.start) {
    const gap = anchor.start - panelEnd;
    const after = anchorEnd + gap;
    return after + panel.size <= room.end ? after : panel.start;
  }
  return panel.start;
}

/** A panel wider than the room starts at its low end. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
