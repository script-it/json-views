import { inferJsonViewRecordTitleKey } from './inference.js'
import { inferFlatColumnPaths } from './table-suitability.js'
import { compareJsonValues, jsonValuesEqual, matchesJsonValueFilter, type JsonComparisonContext, type JsonNumberLookup } from './value-comparison.js'
import type { ValuePath } from './json-path.js'
import {
  JSON_VIEW_PATH_MISSING,
  getJsonViewViewRows,
  matchesJsonViewPath,
  resolveJsonViewRowPath,
  schemaForJsonViewPath,
  type CompiledJsonViewColumn,
  type CompiledJsonViewFilterRule,
  type CompiledJsonViewSchema,
  type CompiledJsonViewView,
  type JsonViewPath,
  type JsonViewViewRow,
} from './metadata.js'
import { defaultTypeRegistry, type JsonViewTypeRegistry } from './type-registry.js'

export interface JsonViewDisplayColumn {
  id: string
  label: string
  path: JsonViewPath
}

export interface JsonViewProjectedCollection {
  rows: JsonViewViewRow[]
  columns: JsonViewDisplayColumn[]
  records: Record<string, unknown>[]
}

export function matchesJsonViewFilterRule(
  value: unknown,
  rule: CompiledJsonViewFilterRule,
  descriptor?: CompiledJsonViewSchema['descriptor'],
  typeRegistry: JsonViewTypeRegistry = defaultTypeRegistry,
  context: JsonComparisonContext = {},
): boolean {
  if (descriptor) {
    const typed = typeRegistry.matchesFilter(value, rule.operator, rule.value, descriptor)
    if (typed !== undefined) return typed
  }
  if (value === JSON_VIEW_PATH_MISSING) return rule.operator === 'isEmpty'
  return matchesJsonValueFilter(value, rule.operator, rule.value, context)
}

function filteredRows(
  root: unknown,
  rows: JsonViewViewRow[],
  view: CompiledJsonViewView,
  schema: readonly CompiledJsonViewSchema[],
  typeRegistry: JsonViewTypeRegistry,
  numberAtPath?: JsonNumberLookup,
): JsonViewViewRow[] {
  const filter = view.filter
  if (!filter || filter.rules.length === 0) return rows
  return rows.filter((row) => {
    const matches = filter.rules.map((rule) => {
      const resolved = resolveJsonViewRowPath(root, row, rule.path)
      const descriptor = schemaForJsonViewPath(schema, resolved.sourcePath)?.descriptor
      return matchesJsonViewFilterRule(resolved.value, rule, descriptor, typeRegistry, { numberAtPath, leftPath: resolved.sourcePath, rightPath: rule.sourceValuePath })
    })
    return filter.match === 'all' ? matches.every(Boolean) : matches.some(Boolean)
  })
}

function compare(
  left: unknown,
  right: unknown,
  direction: 'asc' | 'desc',
  descriptor: CompiledJsonViewSchema['descriptor'] | undefined,
  typeRegistry: JsonViewTypeRegistry,
  context: JsonComparisonContext,
): number {
  if (jsonValuesEqual(left, right, context)) return 0
  if (left === JSON_VIEW_PATH_MISSING || left == null) return 1
  if (right === JSON_VIEW_PATH_MISSING || right == null) return -1
  const typed = descriptor ? typeRegistry.compare(left, right, descriptor, direction) : undefined
  if (typed !== undefined) return typed
  const result = compareJsonValues(left, right, context)
  return direction === 'desc' ? -result : result
}

function sortedRows(
  root: unknown,
  rows: JsonViewViewRow[],
  view: CompiledJsonViewView,
  schema: readonly CompiledJsonViewSchema[],
  typeRegistry: JsonViewTypeRegistry,
  numberAtPath?: JsonNumberLookup,
): JsonViewViewRow[] {
  if (view.sort.length === 0) return rows
  const prepared = rows.map((row, index) => ({
    row, index,
    fields: view.sort.map((sort) => {
      const resolved = resolveJsonViewRowPath(root, row, sort.path)
      return { value: resolved.value, sourcePath: resolved.sourcePath, descriptor: schemaForJsonViewPath(schema, resolved.sourcePath)?.descriptor }
    }),
  }))
  // Each column uses one comparator for every pair, including mixed-type annotations.
  const descriptors = view.sort.map((_, index) => {
    const defined = prepared.map((item) => item.fields[index].descriptor).filter((item) => item !== undefined)
    return new Set(defined.map((item) => item.type)).size === 1 ? defined[0] : undefined
  })
  return prepared.sort((left, right) => {
    for (let index = 0; index < view.sort.length; index += 1) {
      const result = compare(left.fields[index].value, right.fields[index].value,
        view.sort[index].direction, descriptors[index], typeRegistry, { numberAtPath, leftPath: left.fields[index].sourcePath, rightPath: right.fields[index].sourcePath })
      if (result !== 0) return result
    }
    return left.index - right.index
  }).map(({ row }) => row)
}

export function applyJsonViewViewRows(
  root: unknown,
  view: CompiledJsonViewView,
  schema: readonly CompiledJsonViewSchema[] = [],
  typeRegistry: JsonViewTypeRegistry = defaultTypeRegistry,
  numberAtPath?: JsonNumberLookup,
): JsonViewViewRow[] {
  return sortedRows(root, filteredRows(root, getJsonViewViewRows(view, root), view, schema, typeRegistry, numberAtPath), view, schema, typeRegistry, numberAtPath)
}

function inferredViewProperty(view: CompiledJsonViewView, key: string): JsonViewPath {
  const escaped = key
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return {
    source: `${view.path.source}[*]['${escaped}']`,
    root: '$',
    segments: [...view.path.segments, { kind: 'wildcard' }, { kind: 'property', key }],
  }
}

function inferredColumns(view: CompiledJsonViewView, rows: readonly JsonViewViewRow[]): CompiledJsonViewColumn[] {
  const titleKey = inferJsonViewRecordTitleKey(rows.map((row) => row.value))
  const flattened = inferFlatColumnPaths(rows.map((row) => row.value))
  if (flattened && titleKey) flattened.sort((a, b) => Number(b.length === 1 && b[0] === titleKey) - Number(a.length === 1 && a[0] === titleKey))
  if (flattened) return flattened.map((parts, index) => {
    const path = inferredViewProperty(view, parts[0])
    for (const key of parts.slice(1)) {
      path.segments.push({ kind: 'property', key })
      path.source += `[${JSON.stringify(key)}]`
    }
    return { label: parts.join(' · '), path, metadataPath: ['__inferred_columns__', index] }
  })
  const keys = new Set<string>()
  rows.forEach((row) => Object.keys(row.value).forEach((key) => keys.add(key)))
  return Array.from(keys).sort((a, b) => Number(b === titleKey) - Number(a === titleKey)).map((key, index) => ({
    label: key,
    path: inferredViewProperty(view, key),
    metadataPath: ['__inferred_columns__', index],
  }))
}

export function projectJsonViewCollection(
  root: unknown,
  view: CompiledJsonViewView,
  schema: readonly CompiledJsonViewSchema[] = [],
  typeRegistry: JsonViewTypeRegistry = defaultTypeRegistry,
  numberAtPath?: JsonNumberLookup,
): JsonViewProjectedCollection {
  const rows = applyJsonViewViewRows(root, view, schema, typeRegistry, numberAtPath)
  const declared = view.columns ?? inferredColumns(view, rows)
  const columns = declared.map((column, index) => ({
    id: `column-${index}`,
    label: column.label,
    path: column.path,
  }))
  const records = rows.map((row) => Object.fromEntries(columns.flatMap((column) => {
    const resolved = resolveJsonViewRowPath(root, row, column.path).value
    return resolved === JSON_VIEW_PATH_MISSING ? [] : [[column.id, resolved]]
  })))
  return { rows, columns, records }
}

export function schemaRelativePathForRow(
  schema: CompiledJsonViewSchema,
  rowPath: ValuePath,
): ValuePath | undefined {
  if (schema.path.segments.length <= rowPath.length) return undefined
  if (!matchesJsonViewPath({ ...schema.path, segments: schema.path.segments.slice(0, rowPath.length) }, rowPath)) return undefined
  const remainder = schema.path.segments.slice(rowPath.length)
  if (remainder.some((segment) => segment.kind === 'wildcard')) return undefined
  const relativePath: Array<string | number> = []
  for (const segment of remainder) {
    if (segment.kind === 'property') relativePath.push(segment.key)
    else if (segment.kind === 'index') relativePath.push(segment.index)
  }
  return relativePath
}
