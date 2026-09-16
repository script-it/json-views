import type { ReactNode } from 'react'
import { Checkbox } from '../primitives/checkbox.js'

/** Both faces share a fixed slot; an invisible checkbox stays in tab order. */
export function RowSelectionIcon({ icon, checked, disabled, label, onToggle }: {
  icon: ReactNode
  checked: boolean
  disabled: boolean
  label: string
  onToggle?: () => void
}) {
  return <span className="tabular-row-icon relative grid h-3.5 w-3.5 shrink-0 place-items-center" data-id={onToggle ? 'tabular-row-select' : undefined}>
    <span aria-hidden className={onToggle ? 'tabular-selection-icon flex' : 'flex'}>{icon}</span>
    {onToggle && <Checkbox
      aria-label={label}
      checked={checked}
      disabled={disabled}
      className="tabular-selection-checkbox absolute inset-0 h-3.5 w-3.5 border-muted-foreground"
      onCheckedChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    />}
  </span>
}
