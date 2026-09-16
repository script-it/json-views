export interface WidgetOption {
  value: string
  label: string
  color?: string
}

export type WidgetOptions = ReadonlyArray<string | number | WidgetOption>

export type UiHint =
  | { type: 'text'; placeholder?: string; multiline?: boolean }
  | { type: 'number'; min?: number; max?: number; step?: number }
  | { type: 'select'; options: string[] }
  | { type: 'multi-select'; options: string[] }
  | { type: 'checkbox' }
  | { type: 'date-picker' }
  | null

export interface InputMetadata {
  type: 'string' | 'float' | 'boolean' | 'array'
  title?: string
  description?: string
  required?: boolean
  ui_hint?: UiHint
}

export interface WidgetProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  ariaLabel?: string
  ariaDescribedBy?: string
  invalid?: boolean
  options?: WidgetOptions
  emptyOptionLabel?: string
  minHeight?: number
  autoSize?: boolean
  surface?: 'default' | 'inline'
  readOnly?: boolean
  disabled?: boolean
  metadata?: InputMetadata
  uiHint?: UiHint
}

export interface DirectSaveWidgetProps extends WidgetProps {
  onDirectSave: (value: unknown) => void
}
