import * as React from 'react'

import {
  ChoiceControl,
  type ChoiceControlProfile,
  type ChoiceOption,
} from './choice-control.js'

export type MultiSelectOption = ChoiceOption

export interface MultiSelectProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string[]
  onChange: (next: string[]) => void
  options: ReadonlyArray<string | number | MultiSelectOption>
  profile?: ChoiceControlProfile
  creatable?: boolean
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  openOnMount?: boolean
  onDismiss?: () => void
  onSelectionBlur?: () => void
  onOptionColorChange?: (optionValue: string, color: string) => void
}

export const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(
  ({ options, onChange, profile = 'plain', creatable = false, invalid = false, ...props }, ref) => (
    <ChoiceControl
      ref={ref}
      mode="multiple"
      profile={profile}
      creatable={creatable}
      invalid={invalid}
      options={options.map((option) => typeof option === 'object'
        ? option
        : { value: String(option), label: String(option) })}
      onValueChange={onChange}
      {...props}
    />
  ),
)
MultiSelect.displayName = 'MultiSelect'
