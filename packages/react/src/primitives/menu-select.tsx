import { cn } from '../lib/cn.js'
import { ChoiceControl, type ChoiceOption } from './choice-control.js'

export interface MenuSelectProps {
  ariaLabel: string
  className?: string
  disabled?: boolean
  emptyOptionLabel?: string
  onChange: (value: string) => void
  options: ReadonlyArray<ChoiceOption>
  value: string
}

/** The shared compact dropdown used inside JSON Views menus and popovers. */
export function MenuSelect({
  ariaLabel,
  className,
  disabled,
  emptyOptionLabel,
  onChange,
  options,
  value,
}: MenuSelectProps) {
  return (
    <ChoiceControl
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      disabled={disabled}
      emptyOptionLabel={emptyOptionLabel}
      mode="single"
      nonModal
      options={options}
      profile="menu"
      value={value ? [value] : []}
      onValueChange={(next) => onChange(next[0] ?? '')}
    />
  )
}
