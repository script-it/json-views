import { X } from 'lucide-react'

import { cn } from '../lib/cn.js'

const OPTION_PILL_COLORS: Record<string, string> = {
  gray: 'bg-muted text-foreground',
  blue: 'bg-muted text-foreground',
  green: 'bg-muted text-foreground',
  yellow: 'bg-muted text-foreground',
  orange: 'bg-muted text-foreground',
  red: 'bg-muted text-foreground',
  purple: 'bg-muted text-foreground',
  pink: 'bg-muted text-foreground',
}

const AUTOMATIC_OPTION_COLORS = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'gray'] as const

/** Reserve manual colors first, then balance automatic assignments across the full palette. */
export function optionColorsForValues(values: readonly string[], explicit: Readonly<Record<string, string>> = {}, offset = 0): Record<string, (typeof AUTOMATIC_OPTION_COLORS)[number]> {
  const colors: Record<string, (typeof AUTOMATIC_OPTION_COLORS)[number]> = Object.create(null)
  const uses = new Map<string, number>(AUTOMATIC_OPTION_COLORS.map((color) => [color, 0]))
  const start = ((offset % AUTOMATIC_OPTION_COLORS.length) + AUTOMATIC_OPTION_COLORS.length) % AUTOMATIC_OPTION_COLORS.length
  const rotation = [...AUTOMATIC_OPTION_COLORS.slice(start), ...AUTOMATIC_OPTION_COLORS.slice(0, start)]
  const unique = [...new Set(values)]
  for (const value of unique) {
    const color = explicit[value]
    if (!uses.has(color)) continue
    colors[value] = color as (typeof AUTOMATIC_OPTION_COLORS)[number]
    uses.set(color, uses.get(color)! + 1)
  }
  for (const value of unique) {
    if (colors[value]) continue
    const color = rotation.reduce((best, candidate) => uses.get(candidate)! < uses.get(best)! ? candidate : best)
    colors[value] = color
    uses.set(color, uses.get(color)! + 1)
  }
  return colors
}

export function optionColorForLabel(value: string): string {
  const hash = [...value].reduce(
    (total, character) => ((total * 31) + (character.codePointAt(0) ?? 0)) >>> 0,
    0,
  )
  return AUTOMATIC_OPTION_COLORS[hash % AUTOMATIC_OPTION_COLORS.length]
}

export interface OptionPillProps {
  label: string
  color?: string
  onRemove?: () => void
  className?: string
  labelClassName?: string
}

export function OptionPill({ label, color, onRemove, className, labelClassName }: OptionPillProps) {
  const resolvedColor = color && OPTION_PILL_COLORS[color]
    ? color
    : optionColorForLabel(label)

  return (
    <span
      data-id="option-pill"
      data-option-color={resolvedColor}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
        OPTION_PILL_COLORS[resolvedColor],
        className,
      )}
    >
      <span className={labelClassName}>{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="-mr-1 grid h-4 w-4 place-items-center rounded-sm opacity-70 hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
