import { READONLY_FIELD_CLASSES } from './read-only-field.js'
import { cn } from '../lib/cn.js'
import type { WidgetProps } from './types.js'

const EDITABLE_CLASSES =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export function TextWidget({
  value,
  onChange,
  onBlur,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  readOnly = false,
  disabled = false,
  surface = 'default',
  uiHint,
}: WidgetProps) {
  const placeholder = readOnly
    ? '—'
    : uiHint?.type === 'text' &&
        'placeholder' in uiHint &&
        typeof uiHint.placeholder === 'string' &&
        uiHint.placeholder.length > 0
      ? uiHint.placeholder
      : 'Enter value'

  return (
    <input
      autoFocus={!readOnly}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(
        readOnly
          ? READONLY_FIELD_CLASSES
          : surface === 'inline'
            ? 'h-7 w-full rounded-sm border border-transparent bg-transparent px-1 py-0 text-xs outline-none hover:bg-accent/40 focus:border-transparent focus:ring-1 focus:ring-inset focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            : EDITABLE_CLASSES,
        invalid && 'border-destructive focus:border-destructive focus:ring-destructive/20',
      )}
    />
  )
}
