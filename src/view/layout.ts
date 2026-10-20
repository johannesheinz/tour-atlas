/** Wide and tall enough windows show everything at once: header, sidebar, map and timeline; only lists scroll. */
export const FRAME_LAYOUT_QUERY = '(min-width: 821px) and (min-height: 560px)';

/** In the frame the map keeps at least this share of the atlas; the timeline lanes scroll within the rest. */
export const MAP_SHARE = 0.5;

/** Phones: the map and timeline fill the window above a bottom sheet that holds the lists (src/view/sheet.ts). */
export const PHONE_LAYOUT_QUERY = '(max-width: 820px)';

/** Above the phone's sheet the timeline's controls take two rows, so the map keeps a larger share. */
export const PHONE_MAP_SHARE = 0.6;
