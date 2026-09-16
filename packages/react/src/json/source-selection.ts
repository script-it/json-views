import type { ValuePath } from '@script-it/json-views-core'

/** A whole-data view is context, not a selection. Root metadata does not count as data. */
export function coversAllDocumentData(root: unknown, paths: readonly ValuePath[]): boolean {
  const covered = (value: unknown, path: ValuePath): boolean => {
    if (paths.some((selected) => selected.length <= path.length && selected.every((part, index) => part === path[index]))) return true
    if (value === null || typeof value !== 'object') return false
    const keys = Array.isArray(value)
      ? value.map((_, index) => index)
      : Object.keys(value).filter((key) => path.length > 0 || key !== '$jsonviews')
    if (keys.length === 0) return false
    return keys.every((key) => covered((value as Record<string | number, unknown>)[key], [...path, key]))
  }
  return covered(root, [])
}
