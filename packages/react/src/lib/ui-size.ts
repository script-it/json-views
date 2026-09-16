/**
 * App-wide UI size: the three stops a user can pick in Settings → Appearance.
 *
 * The CSS side lives in `src/tokens/ui-size.css`, which keys the root
 * font-size off a `data-ui-size` attribute on <html> — that cascade is what
 * scales the whole rem-based UI. This module is the JS mirror: the stop names,
 * the attribute contract, and the numeric multiplier for consumers that need
 * the scale outside CSS (e.g. virtualized row heights). Keep in sync with the
 * token file.
 */

export const UI_SIZES = ['small', 'medium', 'large'] as const

export type UiSize = (typeof UI_SIZES)[number]

/** Attribute on <html> that `tokens/ui-size.css` keys the root font-size off. */
export const UI_SIZE_ATTRIBUTE = 'data-ui-size'

/** Root font-size multiplier per stop — mirrors `tokens/ui-size.css`. */
export const UI_SIZE_SCALE: Record<UiSize, number> = {
  small: 1,
  medium: 1.125,
  large: 1.25,
}

/**
 * Explorer floor width per stop, in px — the JS mirror of the
 * `--explorer-sidebar-min-width` custom property in `tokens/ui-size.css`
 * (which carries the same numbers for CSS-side pins). Kept as its own stop
 * table rather than `UI_SIZE_SCALE × a base`, because the explorer's tab row
 * grows more slowly than the root font-size: each value is that row's
 * measured content plus a few px, so its trailing controls stay snug against
 * the tabs at every stop. Consumed by hosts whose sizing API takes numbers
 * (react-resizable-panels' Panel props). Keep in sync with the token file.
 */
export const EXPLORER_SIDEBAR_MIN_WIDTH_PX: Record<UiSize, number> = {
  small: 270,
  medium: 294,
  // 318 + 0.5rem (10px at this stop's 20px root), matching the token file's
  // calc(): `large` needs the extra breathing room the others don't.
  large: 328,
}

export function isUiSize(value: unknown): value is UiSize {
  return typeof value === 'string' && (UI_SIZES as readonly string[]).includes(value)
}
