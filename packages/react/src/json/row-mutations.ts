import { type ValuePath } from '@script-it/json-views-core'
import { setJsonValueAtPath, schemaForJsonViewPath, type CompiledJsonViewMetadata, type CompiledJsonViewView, type JsonViewPath, type JsonViewSchemaDescriptor } from '@script-it/json-views-core'


export function blankValue(descriptor: JsonViewSchemaDescriptor | undefined, sample: unknown): unknown {
  if (descriptor) {
    if (descriptor.type === 'checkbox') return false
    if (descriptor.type === 'number') {
      if (typeof descriptor.minimum === 'number') return descriptor.minimum
      if (typeof descriptor.maximum === 'number' && descriptor.maximum < 0) return descriptor.maximum
      return 0
    }
    if (descriptor.type === 'multi-select') return []
    if (descriptor.type === 'select') return descriptor.required ? descriptor.options?.[0] ?? '' : null
    if (descriptor.type === 'date') return null
    if (['text', 'url', 'email', 'body', 'markdown', 'html'].includes(descriptor.type)) return ''
  }
  if (Array.isArray(sample)) return []
  if (sample !== null && typeof sample === 'object') return Object.fromEntries(
    Object.entries(sample).map(([key, value]) => [key, blankValue(undefined, value)]),
  )
  if (typeof sample === 'boolean') return false
  if (typeof sample === 'number') return 0
  if (typeof sample === 'string') return ''
  return sample ?? null
}

export function samePathSegment(left: JsonViewPath['segments'][number], right: JsonViewPath['segments'][number] | undefined): boolean {
  if (!right || left.kind !== right.kind) return false
  if (left.kind === 'property') return left.key === (right as typeof left).key
  if (left.kind === 'index') return left.index === (right as typeof left).index
  return true
}

export function rowFieldPath(view: CompiledJsonViewView, field: JsonViewPath): string[] | undefined {
  if (!view.path.segments.every((segment, index) => samePathSegment(segment, field.segments[index]))) return undefined
  if (field.segments[view.path.segments.length]?.kind !== 'wildcard') return undefined
  const relative = field.segments.slice(view.path.segments.length + 1)
  if (relative.length === 0 || relative.some((segment) => segment.kind !== 'property')) return undefined
  return relative.map((segment) => segment.kind === 'property' ? segment.key : '')
}


export function blankRow(compiled: CompiledJsonViewMetadata, view: CompiledJsonViewView): Record<string, unknown> {
  const collection = view.value
  if (!Array.isArray(collection)) throw new TypeError('Rows can only be added to JSON arrays')
  const sampleIndex = collection.findIndex((value) => value !== null && typeof value === 'object' && !Array.isArray(value))
  if (sampleIndex >= 0) {
    const sample = collection[sampleIndex] as Record<string, unknown>
    return Object.fromEntries(Object.entries(sample).map(([key, value]) => {
      const path: ValuePath = [...view.sourcePath, sampleIndex, key]
      return [key, blankValue(schemaForJsonViewPath(compiled.schema, path)?.descriptor, value)]
    }))
  }

  const result: Record<string, unknown> = {}
  const fields = [
    ...(view.columns ?? []).map((column) => column.path),
    ...compiled.schema.map((entry) => entry.path),
    ...(view.groupBy ? [view.groupBy] : []),
  ]
  const seen = new Set<string>()
  fields.forEach((field) => {
    const relative = rowFieldPath(view, field)
    if (!relative || seen.has(JSON.stringify(relative))) return
    seen.add(JSON.stringify(relative))
    const sourcePath: ValuePath = [...view.sourcePath, 0, ...relative]
    setJsonValueAtPath(result, relative, blankValue(schemaForJsonViewPath(compiled.schema, sourcePath)?.descriptor, undefined))
  })
  return result
}

export function removalOrder(paths: ValuePath[]): ValuePath[] {
  return [...paths].sort((left, right) => {
    if (left.length !== right.length) return right.length - left.length
    const leftLast = left[left.length - 1]
    const rightLast = right[right.length - 1]
    if (typeof leftLast === 'number' && typeof rightLast === 'number') return rightLast - leftLast
    return 0
  })
}
