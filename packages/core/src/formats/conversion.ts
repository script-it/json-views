import { stringifyJsonValue, upsertJsonObjectPropertyInSource } from '../json-source-patcher.js'
import type { StructuredDocumentFormat } from './document-format.js'

export interface ConvertToJsonViewsDocumentOptions {
  root: unknown
  metadata?: unknown
  sourceFormat: StructuredDocumentFormat
  /** Authoritative JSON source when available; preserves exact data tokens. */
  source?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function versionOneMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined) return { version: 1, schema: {}, views: [] }
  if (!isRecord(value)) throw new TypeError('Annotations must be an object')
  if (value.version !== undefined && value.version !== 1) throw new TypeError('Only version 1 annotations can be converted')
  return { ...value, version: 1 }
}

export function rebaseJsonViewsRootPath(path: string): string {
  if (path === '$') return '$.data'
  return path.startsWith('$') ? `$.data${path.slice(1)}` : path
}

function rebaseField(value: unknown): unknown {
  if (!isRecord(value)) return value
  return { ...value, ...(typeof value.path === 'string' ? { path: rebaseJsonViewsRootPath(value.path) } : {}) }
}

/** Rebase only specification-defined path positions. Filter values and extension
 * payloads are user data, even when they contain properties named path/title.
 */
export function rebaseJsonViewsMetadata(metadata: unknown): Record<string, unknown> {
  const source = versionOneMetadata(metadata)
  const views = Array.isArray(source.views) ? source.views.map((value) => {
    if (!isRecord(value)) return value
    const view = { ...value }
    for (const key of ['path', 'groupBy', 'orderPath']) {
      if (typeof view[key] === 'string') view[key] = rebaseJsonViewsRootPath(view[key])
    }
    for (const key of ['columns', 'sort']) {
      if (Array.isArray(view[key])) view[key] = view[key].map(rebaseField)
    }
    if (isRecord(view.filter) && Array.isArray(view.filter.rules)) {
      view.filter = { ...view.filter, rules: view.filter.rules.map(rebaseField) }
    }
    return view
  }) : source.views ?? []
  const schema = isRecord(source.schema)
    ? Object.fromEntries(Object.entries(source.schema).map(([path, descriptor]) => [rebaseJsonViewsRootPath(path), descriptor]))
    : source.schema ?? {}
  return { ...source, schema, views }
}

/** Converts an array-root JSON or CSV-normalized root into the canonical envelope.
 * Pass source for imported JSON; a parsed root alone cannot retain source spelling.
 */
export function convertToJsonViewsDocument({ root, metadata, sourceFormat, source }: ConvertToJsonViewsDocumentOptions): string {
  const authoritative: unknown = source === undefined ? root : JSON.parse(source)
  if (sourceFormat === 'json-object') {
    if (!isRecord(authoritative)) throw new TypeError('Object-root conversion requires a JSON object')
    const annotations = versionOneMetadata(metadata)
    if (source !== undefined) return upsertJsonObjectPropertyInSource(source, [], '$jsonviews', annotations)
    return `${stringifyJsonValue({ ...authoritative, $jsonviews: annotations }, 2)}\n`
  }
  if (!Array.isArray(authoritative)) throw new TypeError('CSV and array-root conversion requires an array root')
  if (sourceFormat === 'json-array' && source !== undefined) {
    const newline = source.includes('\r\n') ? '\r\n' : '\n'
    const indent = (value: string) => value.replace(/\r?\n/g, `${newline}  `)
    const metadataSource = indent(stringifyJsonValue(rebaseJsonViewsMetadata(metadata), 2))
    const dataSource = indent(source.trim())
    const trailing = /\r?\n$/.test(source) ? newline : ''
    return `{${newline}  "$jsonviews": ${metadataSource},${newline}  "data": ${dataSource}${newline}}${trailing}`
  }
  return `${stringifyJsonValue({ $jsonviews: rebaseJsonViewsMetadata(metadata), data: authoritative }, 2)}\n`
}
