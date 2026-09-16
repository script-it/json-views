import { BooleanToggle } from '../primitives/boolean-toggle.js'
import { ReadOnlyChip } from './read-only-field.js'
import { cn } from '../lib/cn.js'
import type { DirectSaveWidgetProps } from './types.js'

export function BooleanWidget({
  value,
  onChange,
  onDirectSave,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  readOnly = false,
  disabled = false,
}: DirectSaveWidgetProps) {
  const boolValue = value.toLowerCase() === 'true'

  if (readOnly) {
    return (
      <div className="flex items-center gap-2" aria-readonly="true">
        <ReadOnlyChip emphasis={boolValue}>True</ReadOnlyChip>
        <ReadOnlyChip emphasis={!boolValue}>False</ReadOnlyChip>
      </div>
    )
  }

  const handleChange = (next: boolean) => {
    onChange(String(next))
    onDirectSave(next)
  }

  return <BooleanToggle aria-label={ariaLabel} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} value={boolValue} onChange={handleChange} disabled={disabled} className={cn(invalid && '[&_button]:border-destructive')} />
}
