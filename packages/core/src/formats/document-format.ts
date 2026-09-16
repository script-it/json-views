import type { ValuePath } from '../json-path.js'

export type StructuredDocumentFormat = 'json-object' | 'json-array' | 'csv'

export interface DocumentDiagnostic {
  code: string
  message: string
  severity: 'warning' | 'error'
  path?: ValuePath
  start?: number
  end?: number
  help?: import('../annotation-capabilities.js').JsonViewDiagnosticHelp
}

export interface ValueReplacement {
  path: ValuePath
  value: unknown
}

export type FormatCapability =
  | { representable: true }
  | { representable: false; reason: string }

export interface StructuredDocumentAdapter<TState> {
  readonly format: StructuredDocumentFormat

  inspect(source: string): {
    root: unknown
    state: TState
    diagnostics: DocumentDiagnostic[]
  }

  validate(source: string): void
  replace(source: string, state: TState, path: ValuePath, value: unknown): string
  replaceMany(source: string, state: TState, changes: readonly ValueReplacement[]): string
  removeMany(source: string, state: TState, paths: readonly ValuePath[]): string
  append(source: string, state: TState, path: ValuePath, value: unknown): string
  canRepresent(value: unknown): FormatCapability
}
