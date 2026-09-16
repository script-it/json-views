import { parseDateValue } from './date-type.js'
import { isJsonViewTableCandidate } from './table-suitability.js'
import { isHtmlDocument, isMarkdownText, normalizedKey } from './inference-fields.js'

export interface InferredJsonViewSchemaDescriptor {
  type: string
  title: string
  options?: string[]
  defaultIncludeTime?: boolean
}

export interface InferredJsonViewDefinition {
  id: string
  name: string
  path: string
  columns?: Array<{ label: string; path: string }>
  display?: 'kanban'
  groupBy?: string
}

export interface InferredJsonViewMetadata {
  version: 1
  schema: Record<string, InferredJsonViewSchemaDescriptor>
  views: InferredJsonViewDefinition[]
}

type SourcePath = Array<string | number>

interface InferredField {
  label?: string
  descriptor?: InferredJsonViewSchemaDescriptor
  direct: boolean
  key: string
  path: string
}

interface CollectionCandidate {
  label: string
  path: SourcePath
  rows: Record<string, unknown>[]
  score: number
  table: boolean
  promote: boolean
  value: unknown
}

const MAX_COLLECTIONS = 4
const MAX_PREDICTED_VIEWS = 2
const MAX_FIELDS_PER_SHAPE = 64
const MAX_DISCOVERY_DEPTH = 3
const MAX_SAMPLE_ROWS = 10

const WORKFLOW_KEYS = new Set(['phase', 'stage', 'state', 'status'])
const WORKFLOW_VALUES = new Set(['new', 'open', 'todo', 'to do', 'backlog', 'pending', 'in progress', 'in review', 'review', 'blocked', 'done', 'completed', 'closed', 'cancelled', 'qualified', 'contacted', 'proposal', 'negotiation', 'won', 'lost', 'customer'])
const TITLE_KEY_ORDER = [
  'name', 'title', 'label', 'displayname', 'fullname', 'firstname', 'headline', 'subject', 'email', 'id',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function friendlyLabel(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced ? `${spaced[0].toLocaleUpperCase()}${spaced.slice(1)}` : 'Value'
}

function appendProperty(source: string, key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${source}.${key}`
  const escaped = key
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `${source}['${escaped}']`
}

function jsonPath(path: SourcePath): string {
  return path.reduce<string>((source, segment) => (
    typeof segment === 'number' ? `${source}[${segment}]` : appendProperty(source, segment)
  ), '$')
}

function fieldPath(base: SourcePath, collection: boolean, parts: string[]): string {
  return parts.reduce(appendProperty, `${jsonPath(base)}${collection ? '[*]' : ''}`)
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view'
}

function recordCollection(value: unknown): Record<string, unknown>[] | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0 || !value.every(isRecord)) return undefined
    const rows = value.slice(0, MAX_SAMPLE_ROWS)
    return rows
  }
  if (!isRecord(value)) return undefined
  const values = Object.values(value)
  if (values.length < 2 || !values.every(isRecord)) return undefined
  const rows = values.slice(0, MAX_SAMPLE_ROWS)
  return rows
}

function collectionLabel(path: SourcePath, rootValue: unknown): string {
  const last = path[path.length - 1]
  if (typeof last === 'string') return friendlyLabel(last)
  return Array.isArray(rootValue) ? 'Data' : 'Records'
}

function discoverCollections(root: unknown): CollectionCandidate[] {
  const candidates: CollectionCandidate[] = []
  const visit = (value: unknown, path: SourcePath, depth: number, promote: boolean): void => {
    const rows = recordCollection(value)
    if (rows) {
      const table = isJsonViewTableCandidate(value)
      candidates.push({
        label: collectionLabel(path, root),
        path,
        rows,
        score: (table && promote ? 2000 : table ? 1000 : 0) + 100 - depth * 12 + Math.min(rows.length, 20),
        table,
        promote,
        value,
      })
      // Never promote a child of a record collection as a document-level view.
      // Continue discovering its field types when the parent is not tabular.
      if (table) return
    }
    if (depth >= MAX_DISCOVERY_DEPTH || !isRecord(value)) return
    const children = Object.entries(value).filter(([key]) => key !== '$jsonviews').map(([, child]) => child)
    const recordDictionary = children.length >= 2 && children.every(isRecord)
    Object.entries(value).forEach(([key, child]) => {
      if (key === '$jsonviews') return
      if (Array.isArray(child) || isRecord(child)) visit(child, [...path, key], depth + 1, promote && !rows && !recordDictionary)
    })
  }
  visit(root, [], 0, true)
  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_COLLECTIONS)
}

function validWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function uniqueStrings(values: readonly string[], limit = 64): string[] {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    unique.push(value)
    if (unique.length >= limit) break
  }
  return unique
}

function descriptorFor(key: string, values: unknown[]): InferredJsonViewSchemaDescriptor | undefined {
  const present = values.filter((value) => value !== null && value !== undefined)
  if (present.length === 0) return undefined
  const title = friendlyLabel(key)
  if (present.every((value) => typeof value === 'boolean')) return { type: 'checkbox', title }
  if (present.every((value) => typeof value === 'number' && Number.isFinite(value))) return { type: 'number', title }
  if (present.every((value) => Array.isArray(value) && value.every((item) => typeof item === 'string'))) {
    const options = uniqueStrings(present.flatMap((value) => value as string[]), 41)
    if (options.length === 0) return undefined
    if (options.length <= 40 && options.every((option) => option.length <= 40 && !/[\n@]/.test(option) && !validWebUrl(option))) {
      return { type: 'multi-select', title, options }
    }
    return undefined
  }
  if (!present.every((value) => typeof value === 'string')) return undefined

  const strings = present as string[]
  if (strings.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return { type: 'email', title }
  if (strings.every(validWebUrl)) return { type: 'url', title }
  const dates = strings.map(parseDateValue)
  if (dates.every((date) => date.kind === 'date' || date.kind === 'datetime' || date.kind === 'floating-datetime')) {
    return {
      type: 'date',
      title,
      ...(dates.some((date) => date.kind !== 'date') ? { defaultIncludeTime: true } : {}),
    }
  }


  const nonempty = strings.filter((value) => value.trim().length > 0)
  if (nonempty.length > 0 && nonempty.some(isHtmlDocument)) return { type: 'html', title }
  if (nonempty.length > 0 && nonempty.some(isMarkdownText)) return { type: 'markdown', title }

  const options = uniqueStrings(strings, 21)
  const repeatedSmallSet = options.length <= 20 && options.length < strings.length
  if (repeatedSmallSet && options.length >= 1
    && options.every((option) => option.trim().length > 0 && option.length <= 40 && !/[\n@]/.test(option) && !validWebUrl(option))) {
    return { type: 'select', title, options }
  }
  return { type: 'text', title }
}

function inferFields(rows: readonly Record<string, unknown>[], base: SourcePath, collection: boolean): InferredField[] {
  const fields: InferredField[] = []
  const visit = (records: readonly Record<string, unknown>[], parts: string[], depth: number): void => {
    if (fields.length >= MAX_FIELDS_PER_SHAPE) return
    const keys: string[] = []
    const seen = new Set<string>()
    records.forEach((record) => Object.keys(record).forEach((key) => {
      if (key === '$jsonviews' || seen.has(key)) return
      seen.add(key)
      keys.push(key)
    }))
    for (const key of keys) {
      if (fields.length >= MAX_FIELDS_PER_SHAPE) return
      const values = records.flatMap((record) => Object.prototype.hasOwnProperty.call(record, key) ? [record[key]] : [])
      const present = values.filter((value) => value !== null && value !== undefined)
      if (depth < 2 && present.length / records.length >= 0.8 && present.every(isRecord)
        && !present.some((value) => recordCollection(value) !== undefined)) {
        visit(present as Record<string, unknown>[], [...parts, key], depth + 1)
        continue
      }
      const descriptor = descriptorFor(key, values)
      if (descriptor || parts.length === 0) {
        fields.push({
          ...(parts.length > 0 ? { label: [...parts, key].map(friendlyLabel).join(' · ') } : {}),
          ...(descriptor ? { descriptor } : {}),
          direct: parts.length === 0,
          key,
          path: fieldPath(base, collection, [...parts, key]),
        })
      }
    }
  }
  visit(rows, [], 0)

  return fields
}

function titleField(fields: readonly InferredField[], allowFallback = true): InferredField | undefined {
  for (const key of TITLE_KEY_ORDER) {
    const field = fields.find((candidate) => (
      candidate.direct
      && normalizedKey(candidate.key) === key
      && candidate.descriptor !== undefined
      && ['text', 'email', 'select', 'number'].includes(candidate.descriptor.type)
    ))
    if (field) return field
  }
  return allowFallback ? fields.find((field) => field.descriptor && field.descriptor.type === 'text') : undefined
}

/** Uses the metadata title policy. Disable the first-text fallback for record headings. */
export function inferJsonViewRecordTitleKey(rows: readonly Record<string, unknown>[], allowFallback = true): string | undefined {
  return titleField(inferFields(rows, [], true), allowFallback)?.key
}

function visibleColumns(fields: readonly InferredField[], title: InferredField | undefined): InferredField[] {
  return title ? [title, ...fields.filter((field) => field !== title)] : [...fields]
}

function groupField(fields: readonly InferredField[], value: unknown, title: InferredField | undefined): InferredField | undefined {
  if (!title || normalizedKey(title.key) === 'id' || !TITLE_KEY_ORDER.includes(normalizedKey(title.key))) return undefined
  // Tables sample shape, but a board must account for every group it will show.
  const rows = (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) as Record<string, unknown>[]
  const titles = rows.map((row) => row[title.key])
  if (!titles.every((value) => typeof value === 'string' && value.trim().length > 0)
    || new Set(titles).size / rows.length < 0.8) return undefined
  return fields.find((field) => (
    field.direct
    && field.descriptor?.type === 'select'
    && WORKFLOW_KEYS.has(normalizedKey(field.key))
    && field.descriptor.options?.every((option) => WORKFLOW_VALUES.has(option.toLowerCase().replace(/[_-]+/g, ' ').trim()))
    && (field.descriptor.options?.length ?? 0) >= 2
    && (field.descriptor.options?.length ?? 0) <= 6
    && rows.every((row) => typeof row[field.key] === 'string' && String(row[field.key]).trim().length > 0
      && field.descriptor!.options!.includes(row[field.key] as string))
    && field.descriptor.options!.every((option) => rows.filter((row) => row[field.key] === option).length >= 2)
  ))
}

function uniqueId(preferred: string, used: Set<string>): string {
  let id = preferred
  let suffix = 2
  while (used.has(id)) {
    id = `${preferred}-${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

/** Predicts useful metadata without mutating the source JSON. */
export function inferJsonViewMetadata(root: unknown): InferredJsonViewMetadata {
  const schema: Record<string, InferredJsonViewSchemaDescriptor> = {}
  const views: InferredJsonViewDefinition[] = []
  const usedIds = new Set<string>()
  const collections = discoverCollections(root)

  if (isRecord(root) && recordCollection(root) === undefined) {
    inferFields([root], [], false).forEach((field) => {
      if (field.descriptor) schema[field.path] = field.descriptor
    })
  }

  collections.forEach((collection) => {
    const fields = inferFields(collection.rows, collection.path, true)
    const allRows = (Array.isArray(collection.value) ? collection.value : Object.values(collection.value as Record<string, unknown>)) as Record<string, unknown>[]
    for (const key of new Set(allRows.flatMap((row) => Object.keys(row)))) {
      if (key === '$jsonviews' || fields.some((field) => field.key === key && field.direct || field.path.startsWith(`${fieldPath(collection.path, true, [key])}.`))) continue
      fields.push({ key, direct: true, path: fieldPath(collection.path, true, [key]) })
    }

    fields.forEach((field) => {
      if (field.descriptor) schema[field.path] = field.descriptor
    })
    if (collection.path.length === 0 || !collection.table || !collection.promote) return
    const title = titleField(fields)
    const columns = visibleColumns(fields, title)
    const path = jsonPath(collection.path)
    const baseId = slug(collection.path.map(String).join('-') || collection.label)
    const table: InferredJsonViewDefinition = {
      id: uniqueId(baseId, usedIds),
      name: collection.label,
      path,
      ...(columns.length > 0 ? { columns: columns.map((field) => ({ label: field.label ?? field.descriptor?.title ?? friendlyLabel(field.key), path: field.path })) } : {}),
    }
    if (views.length < MAX_PREDICTED_VIEWS) views.push(table)

    const group = groupField(fields, collection.value, title)
    if (group && views.length < MAX_PREDICTED_VIEWS) {
      views.push({
        ...table,
        id: uniqueId(`${baseId}-board`, usedIds),
        name: `${collection.label} board`,
        display: 'kanban',
        groupBy: group.path,
      })
    }
  })

  return { version: 1, schema, views }
}
