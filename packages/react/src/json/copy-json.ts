import type { ValuePath } from '@script-it/json-views-core'

type SourceLiteralLookup = (path?: ValuePath | null) => string | undefined

function jsonPointerToken(segment: string | number): string {
  return encodeURIComponent(String(segment).replace(/~/g, '~0').replace(/\//g, '~1'))
}

/** A filename-qualified URI reference whose fragment is an RFC 6901 JSON Pointer. */
export function jsonPathReference(fileName: string, path: ValuePath): string {
  const safeFileName = encodeURIComponent(fileName || 'document.json')
  return `${safeFileName}#${path.map((segment) => `/${jsonPointerToken(segment)}`).join('')}`
}

export function jsonRowsReferenceText(
  fileName: string,
  rows: readonly { sourcePath: ValuePath }[],
): string {
  return JSON.stringify(rows.map((row) => jsonPathReference(fileName, row.sourcePath)))
}

function serializeJsonValue(
  value: unknown,
  sourcePath: ValuePath,
  sourceLiteral: SourceLiteralLookup,
  depth: number,
): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    const literal = sourceLiteral(sourcePath)
    if (literal !== undefined) return literal
    if (!Number.isFinite(value)) throw new TypeError('This record contains a number that cannot be copied as JSON')
    return Object.is(value, -0) ? '-0' : String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const childIndent = '  '.repeat(depth + 1)
    const closingIndent = '  '.repeat(depth)
    return `[\n${value.map((item, index) => `${childIndent}${serializeJsonValue(item, [...sourcePath, index], sourceLiteral, depth + 1)}`).join(',\n')}\n${closingIndent}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
    if (entries.length === 0) return '{}'
    const childIndent = '  '.repeat(depth + 1)
    const closingIndent = '  '.repeat(depth)
    return `{\n${entries.map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${serializeJsonValue(item, [...sourcePath, key], sourceLiteral, depth + 1)}`).join(',\n')}\n${closingIndent}}`
  }
  throw new TypeError(`Cannot copy a ${typeof value} value as JSON`)
}

/** Pretty JSON for one record while retaining unsafe number tokens from source. */
export function jsonRecordCopyText(
  value: unknown,
  sourcePath: ValuePath,
  sourceLiteral: SourceLiteralLookup,
): string {
  return serializeJsonValue(value, sourcePath, sourceLiteral, 0)
}

/** Selected rows are always copied as an array, in their visible table order. */
export function jsonRowsCopyText(
  rows: readonly { value: unknown; sourcePath: ValuePath }[],
  sourceLiteral: SourceLiteralLookup,
): string {
  if (rows.length === 0) return '[]'
  return `[\n${rows.map((row) => `  ${serializeJsonValue(row.value, row.sourcePath, sourceLiteral, 1)}`).join(',\n')}\n]`
}
