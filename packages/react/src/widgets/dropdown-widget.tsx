import { ChevronDown } from 'lucide-react'
import { ChoiceControl, type ChoiceControlProfile } from '../primitives/choice-control.js'
import { cn } from '../lib/cn.js'
import { READONLY_FIELD_CLASSES, ReadOnlyEmpty } from './read-only-field.js'
import type { WidgetProps } from './types.js'

export interface DropdownWidgetProps extends WidgetProps {
  profile?: Extract<ChoiceControlProfile, 'pill' | 'pill-cell'>
  creatable?: boolean
  openOnMount?: boolean
  onDismiss?: () => void
  onOptionColorChange?: (optionValue: string, color: string) => void
}

export function DropdownWidget({
  value,
  onChange,
  onBlur,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  options: optionOverrides,
  emptyOptionLabel,
  profile,
  creatable = false,
  openOnMount,
  onDismiss,
  onOptionColorChange,
  readOnly = false,
  disabled = false,
  uiHint,
}: DropdownWidgetProps) {
  const options = optionOverrides ?? (
    uiHint && 'options' in uiHint && Array.isArray(uiHint.options)
      ? uiHint.options
      : []
  )
  const normalizedOptions = options.map((option) => typeof option === 'object'
    ? option
    : { value: String(option), label: String(option) })

  if (readOnly) {
    const match = options.find((option) => (typeof option === 'object' ? option.value : String(option)) === value)
    const label = typeof match === 'object' ? match.label : match ?? value

    return (
      <div className="relative w-full" aria-readonly="true">
        <div className={cn(READONLY_FIELD_CLASSES, 'truncate pr-9')}>
          {label ? label : <ReadOnlyEmpty />}
        </div>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50"
        />
      </div>
    )
  }

  return (
    <ChoiceControl
      mode="single"
      profile={profile ?? 'menu'}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      invalid={invalid}
      creatable={creatable}
      openOnMount={openOnMount}
      onDismiss={onDismiss}
      value={value ? [value] : []}
      onValueChange={(next) => onChange(next[0] ?? '')}
      onSelectionBlur={onBlur}
      disabled={disabled}
      emptyOptionLabel={emptyOptionLabel}
      options={normalizedOptions}
      onOptionColorChange={onOptionColorChange}
    />
  )
}
