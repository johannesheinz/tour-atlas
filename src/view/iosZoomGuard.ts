/**
 * iOS Safari zooms the page in when a form control set below 16 px gets focus. Where a control should look smaller,
 * src/styles.css therefore sets it at 16 px with every length divided by SHOWN_SIZE_RATIO and shrinks it back with
 * a transform, under IOS_ZOOM_GUARD_CLASS on <html>. DOM-free, so it is testable in Node.
 */
export const IOS_ZOOM_GUARD_CLASS = 'ios-zoom-guard';

/** The size a guarded control shows at, relative to the 16 px it is set at; src/styles.css scales by the same. */
export const SHOWN_SIZE_RATIO = 0.75;

/** Only iOS and iPadOS WebKit know -webkit-touch-callout. */
export function needsIosZoomGuard(supports: (property: string, value: string) => boolean): boolean {
  return supports('-webkit-touch-callout', 'none');
}

/** A transform leaves the layout box at full size; this negative right margin hands the width it frees back to the row. */
export function shrunkControlMarginRight(layoutWidth: number): number {
  if (!Number.isFinite(layoutWidth) || layoutWidth < 0) throw new Error(`a control's layout width must be a finite, non-negative length, is ${layoutWidth}`);
  return -layoutWidth * (1 - SHOWN_SIZE_RATIO);
}
