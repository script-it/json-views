import type { JsonPatchError, JsonPatchOperation, JsonViewDiagnosticHelp } from '@script-it/json-views-core'
import agentHelp from './agent-help.md?raw'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface JsonViewsDiagnostic {
  code: string
  declaration?: string
  end?: number
  message: string
  metadataPath?: ReadonlyArray<string | number>
  operationIndex?: number
  patchPath?: string
  from?: string
  scope: 'source' | 'metadata' | 'schema' | 'view' | 'value' | 'patch'
  severity: 'warning' | 'error'
  sourcePath?: ReadonlyArray<string | number>
  start?: number
  viewId?: string
  metadataSource?: 'embedded' | 'external' | 'inferred'
  token?: string
  help?: JsonViewDiagnosticHelp
}

export interface JsonViewsDocumentInfo {
  active: boolean
  diagnosticCount?: number
  filename: string
  relativePath?: string
  id: string
  label?: string
  revision?: string
  storage: 'browser' | 'local-file' | 'example'
  valid: boolean
}

export interface JsonViewsDocumentInspection extends JsonViewsDocumentInfo {
  diagnostics: JsonViewsDiagnostic[]
}

/** Rejected before document mutation; WebMCP serializes these diagnostics explicitly. */
export class JsonViewsSourceValidationError extends Error {
  readonly diagnostics: JsonViewsDiagnostic[]

  constructor(diagnostics: JsonViewsDiagnostic[]) {
    super(diagnostics.map((item) => item.message).join(' '))
    this.name = 'JsonViewsSourceValidationError'
    this.diagnostics = diagnostics
  }
}

/** Rejected before document mutation; WebMCP serializes these diagnostics explicitly. */
export class JsonViewsPatchValidationError extends Error {
  readonly diagnostics: JsonViewsDiagnostic[]

  constructor(diagnostics: JsonViewsDiagnostic[]) {
    super(diagnostics.map((item) => item.message).join(' '))
    this.name = 'JsonViewsPatchValidationError'
    this.diagnostics = diagnostics
  }
}

export function jsonPatchDiagnostic(error: JsonPatchError): JsonViewsDiagnostic {
  const common = {
    code: error.code,
    message: error.message,
    scope: 'patch' as const,
    severity: 'error' as const,
    ...(error.operationIndex === undefined ? {} : { operationIndex: error.operationIndex }),
    ...(error.path === undefined ? {} : { patchPath: error.path }),
    ...(error.from === undefined ? {} : { from: error.from }),
  }
  const capabilities = ['Operations are applied in order as one atomic RFC 6902 JSON Patch; a failure leaves the document unchanged.', 'Paths use RFC 6901 JSON Pointer. The empty string selects the document root; /a~1b selects property a/b; /items/- appends.']
  switch (error.code) {
    case 'invalid-patch':
      return { ...common, help: { fix: 'Send patch as an array of operation objects.', expected: 'RFC 6902 operation[]', examples: [[{ op: 'replace', path: '/done', value: true }]], capabilities } }
    case 'invalid-operation':
      return { ...common, help: { fix: 'Use a supported op with string path and the members required by that op.', expected: 'add/remove/replace/move/copy/test operation', allowedValues: ['add', 'remove', 'replace', 'move', 'copy', 'test'], capabilities } }
    case 'invalid-pointer': case 'invalid-array-index':
      return { ...common, help: { fix: 'Correct the JSON Pointer. Escape ~ as ~0 and / inside property names as ~1; use canonical array indices.', expected: 'RFC 6901 JSON Pointer', examples: ['/tasks/0/done', '/a~1b', '/items/-'], capabilities } }
    case 'missing-path':
      return { ...common, help: { fix: 'Read the current document and use an existing target. For add, every parent must exist and an array index may equal its length.', expected: 'existing target, or existing parent for add', capabilities } }
    case 'test-failed':
      return { ...common, help: { fix: 'Read the current value and update the patch or stop because the document changed.', expected: 'the target value equals the test value', capabilities } }
    case 'move-into-descendant':
      return { ...common, help: { fix: 'Choose a destination outside the value being moved.', expected: 'move destination that is not a descendant of from', capabilities } }
    case 'root-removal-not-supported':
      return { ...common, help: { fix: 'Replace the root with another JSON value instead of removing it.', expected: 'a complete JSON document after the patch', examples: [{ op: 'replace', path: '', value: {} }], capabilities } }
    case 'invalid-document':
      return { ...common, help: { fix: 'Repair the current source before applying structured patches.', expected: 'valid JSON source', capabilities } }
    default:
      return { ...common, help: { fix: 'Use only JSON-compatible values without undefined, functions, accessors, cycles, or non-finite numbers.', expected: 'valid JSON value', capabilities } }
  }
}

export interface JsonViewsListOptions {
  includeDiagnosticCount?: boolean
}

export interface JsonViewsConsoleApi {
  readonly version: 1
  create(filename: string, value: JsonValue): Promise<JsonViewsDocumentInspection>
  diagnostics(document: string): JsonViewsDocumentInspection
  get(document: string): JsonValue
  help(): string
  list(options?: JsonViewsListOptions): JsonViewsDocumentInfo[]
  link(document: string, viewName?: string): string
  patch(document: string, patch: readonly JsonPatchOperation[]): Promise<JsonViewsDocumentInspection>
  remove(document: string): void
  select(document: string): JsonViewsDocumentInfo
  setSource(document: string, source: string): Promise<JsonViewsDocumentInspection>
  source(document: string): string
}

declare global {
  interface Window {
    jsonViews?: JsonViewsConsoleApi
  }
}

export const CONSOLE_HELP = agentHelp

export function jsonSource(value: JsonValue): string {
  const source = JSON.stringify(value, null, 2)
  if (source === undefined) throw new Error('The value is not valid JSON')
  return `${source}\n`
}
