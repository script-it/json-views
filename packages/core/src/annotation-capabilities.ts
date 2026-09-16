/** Shared vocabulary for validation and just-in-time diagnostic help. */
export const COMMON_DESCRIPTOR_PROPERTIES = ['type', 'title', 'description', 'required', 'pattern'] as const

export const BUILT_IN_DESCRIPTOR_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  text: ['placeholder', 'multiline'],
  markdown: ['placeholder'],
  html: ['placeholder'],
  number: ['minimum', 'maximum', 'step'],
  checkbox: [],
  select: ['options', 'optionColors'],
  'multi-select': ['options', 'optionColors'],
  date: ['minimum', 'maximum', 'defaultIncludeTime', 'placeholder'],
  url: [],
  email: [],
  body: ['placeholder'],
}

export const ANNOTATION_PROPERTIES = ['version', 'schema', 'views'] as const
export const VIEW_PROPERTIES = ['id', 'name', 'path', 'display', 'html', 'css', 'groupBy', 'groupOrder', 'orderPath', 'columns', 'filter', 'sort'] as const
export const COMMON_FILTER_OPERATORS = [
  'eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte',
  'contains', 'notContains', 'isEmpty', 'isNotEmpty',
] as const

export interface JsonViewDiagnosticHelp {
  /** A concrete manual repair, never an automatically applied data change. */
  fix: string
  expected: string
  /** Bounded preview; use the source and paths for the complete original value. */
  received?: string
  allowedValues?: readonly string[]
  /** Illustrative JSON values or fragments, not patches to apply blindly. */
  examples?: readonly unknown[]
  capabilities?: readonly string[]
}
