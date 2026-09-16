import type { ReactNode } from 'react'
import { cn } from '../lib/cn.js'

/**
 * Shared read-only presentation for the input-editor widgets.
 *
 * Read-only is a mode of each widget, not a substitute component — these are
 * style helpers the widgets compose in their `readOnly` branch, never entries
 * in the widget registry. The look is built entirely from semantic tokens
 * (`muted` / `border` / `foreground`) so it themes in light and dark.
 */

/**
 * Muted, non-interactive boxed field for read-only widgets that render their
 * own container (text, dropdown, date). Matches the editable field footprint
 * (`w-full rounded-md px-3 py-2 text-sm`) so the layout doesn't shift.
 */
export const READONLY_FIELD_CLASSES =
  'w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none'

/**
 * Colour-only override appended to a primitive's `className` when the primitive
 * keeps its own layout but must present as read-only (textarea, number). Relies
 * on the primitives merging `className` last via `cn`, so these win over the
 * editable `border-border bg-card focus:ring-ring` defaults.
 */
export const READONLY_SURFACE_CLASSES =
  'cursor-default border-border bg-muted text-foreground focus:border-border focus:ring-0'

/** The neutral placeholder shown where a read-only value is empty. */
export const READONLY_EMPTY = '—'

/** Renders `—` in muted ink for an empty read-only value. */
export function ReadOnlyEmpty() {
  return <span className="text-muted-foreground">{READONLY_EMPTY}</span>
}

/**
 * Muted, non-interactive chip used by the boolean and multi-select read-only
 * renders. `emphasis` marks a selected option (a filled-but-muted pill) versus
 * an unselected one (quiet outline).
 */
export function ReadOnlyChip({
  children,
  emphasis = false,
  className,
}: {
  children: ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-1 text-sm',
        emphasis
          ? 'border-border bg-muted text-foreground'
          : 'border-border bg-transparent text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
