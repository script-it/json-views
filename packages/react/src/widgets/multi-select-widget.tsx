import yaml, { JSON_SCHEMA } from 'js-yaml'
import { MultiSelect } from '../primitives/multi-select.js'
import type { ChoiceControlProfile } from '../primitives/choice-control.js'
import { ReadOnlyChip, ReadOnlyEmpty } from './read-only-field.js'
import type { WidgetOption, WidgetProps } from './types.js'

export interface MultiSelectWidgetProps extends WidgetProps {
  onDirectSave?: (value: unknown) => void
  profile?: ChoiceControlProfile
  creatable?: boolean
  openOnMount?: boolean
  onDismiss?: () => void
  onOptionColorChange?: (optionValue: string, color: string) => void
}

function parseSelectedValues(value: string): string[] {
  try {
    if (value.startsWith('[')) {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    }
    if (value.startsWith('-')) {
      const parsed = yaml.load(value, { schema: JSON_SCHEMA })
      if (Array.isArray(parsed)) {
        return parsed.map(String)
      }
      return value ? [value] : []
    }
    if (value.includes(',')) {
      return value.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return value ? [value] : []
  } catch {
    return value ? [value] : []
  }
}

function optionValue(option: string | number | WidgetOption): string {
  return typeof option === 'object' ? option.value : String(option)
}

function optionLabel(option: string | number | WidgetOption): string {
  return typeof option === 'object' ? option.label : String(option)
}

export function MultiSelectWidget({
  value,
  onChange,
  onDirectSave,
  onBlur,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  options: optionOverrides,
  profile = 'plain',
  creatable = false,
  openOnMount,
  onDismiss,
  onOptionColorChange,
  readOnly = false,
  disabled = false,
  uiHint,
}: MultiSelectWidgetProps) {
  const options = optionOverrides ?? (
    uiHint && 'options' in uiHint && Array.isArray(uiHint.options)
      ? uiHint.options
      : []
  )

  const selectedValues = parseSelectedValues(value)

  if (readOnly && profile === 'plain') {
    return (
      <div aria-readonly="true">
        {selectedValues.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedValues.map((selected, idx) => (
              <ReadOnlyChip key={idx} emphasis className="px-3 py-1.5">
                {optionLabel(options.find((option) => optionValue(option) === selected) ?? selected)}
              </ReadOnlyChip>
            ))}
          </div>
        ) : (
          <ReadOnlyEmpty />
        )}
      </div>
    )
  }

  const handleChange = (next: string[]) => {
    onChange(JSON.stringify(next))
    onDirectSave?.(next)
  }

  return (
    <MultiSelect
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      invalid={invalid}
      openOnMount={openOnMount}
      onDismiss={onDismiss}
      value={selectedValues}
      onChange={handleChange}
      onSelectionBlur={onBlur}
      options={options}
      disabled={disabled}
      readOnly={readOnly}
      profile={profile}
      creatable={creatable}
      onOptionColorChange={onOptionColorChange}
    />
  )
}
