/**
 * Instagram-style filter picker, shared between Posts and Looks photo
 * uploads. Ids match src/utils/photoFilters.js's PHOTO_FILTERS exactly —
 * that's where the effect is actually baked into the pixels (via sharp) on
 * upload, so it looks the same for every viewer regardless of platform.
 * `previewOverlay` here is just a cheap same-on-every-platform approximation
 * so the picker doesn't look inert while choosing — it does NOT need to
 * match the server's color math precisely.
 */
export interface PhotoFilter {
  id: string;
  name: string;
  previewOverlay?: string;
}

export const PHOTO_FILTERS: PhotoFilter[] = [
  { id: 'original', name: 'Original' },
  { id: 'vivid',    name: 'Vivid' },
  { id: 'warm',     name: 'Warm',    previewOverlay: 'rgba(255,165,60,0.16)' },
  { id: 'cool',     name: 'Cool',    previewOverlay: 'rgba(70,140,255,0.14)' },
  { id: 'mono',     name: 'Mono',    previewOverlay: 'rgba(120,120,120,0.55)' },
  { id: 'fade',     name: 'Fade',    previewOverlay: 'rgba(255,255,255,0.20)' },
  { id: 'vintage',  name: 'Vintage', previewOverlay: 'rgba(196,140,60,0.22)' },
];
