import { NumberInput } from '../primitives/number-input.js'
import { READONLY_SURFACE_CLASSES } from './read-only-field.js'
import { cn } from '../lib/cn.js'
import type { WidgetProps } from './types.js'

export function NumberWidget({
  value,
  onChange,
  onBlur,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  readOnly = false,
  disabled = false,
  surface = 'default',
  metadata,
  uiHint,
}: WidgetProps) {
  const uiHintType = uiHint?.type

  const min =
    uiHint && uiHintType === 'number' && 'min' in uiHint && typeof uiHint.min === 'number'
      ? uiHint.min
      : undefined

  const max =
    uiHint && uiHintType === 'number' && 'max' in uiHint && typeof uiHint.max === 'number'
      ? uiHint.max
      : undefined

  const step =
    uiHint && uiHintType === 'number' && 'step' in uiHint && typeof uiHint.step === 'number'
      ? uiHint.step
      : metadata?.type === 'float'
        ? 0.01
        : 1

  return (
    <NumberInput
      autoFocus={!readOnly}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      min={min}
      max={max}
      step={step}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={readOnly ? '—' : 'Enter a number'}
      className={cn(
        surface === 'inline' && !readOnly && 'h-7 rounded-sm border-transparent bg-transparent px-1 py-0 text-xs shadow-none outline-none hover:bg-accent/40 focus:border-transparent focus:ring-1 focus:ring-inset focus:ring-ring',
        readOnly && READONLY_SURFACE_CLASSES,
        invalid && 'border-destructive focus:border-destructive focus:ring-destructive/20',
      )}
    />
  )
}
