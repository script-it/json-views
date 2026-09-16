import * as React from 'react'
import { cn } from '../lib/cn.js'

export interface BooleanToggleProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  trueLabel?: string
  falseLabel?: string
}

const BooleanToggle = React.forwardRef<HTMLDivElement, BooleanToggleProps>(
  (
    {
      className,
      value,
      onChange,
      disabled = false,
      trueLabel = 'True',
      falseLabel = 'False',
      ...props
    },
    ref,
  ) => {
    const buttonClass = (selected: boolean) =>
      cn(
        'rounded-md border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-accent',
      )

    return (
      <div ref={ref} className={cn('flex items-center gap-2', className)} {...props}>
        <button
          type="button"
          onClick={() => onChange(true)}
          disabled={disabled}
          aria-pressed={value}
          className={buttonClass(value)}
        >
          {trueLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          disabled={disabled}
          aria-pressed={!value}
          className={buttonClass(!value)}
        >
          {falseLabel}
        </button>
      </div>
    )
  },
)
BooleanToggle.displayName = 'BooleanToggle'

export { BooleanToggle }
