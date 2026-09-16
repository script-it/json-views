/**
 * Pure helpers for deciding how the JSON viewer should present a value.
 *
 * Kept free of React/DOM so the detection logic is unit-testable on its own.
 */

import { isJsonViewTableCandidate } from '@script-it/json-views-core'

/**
 * True for `{...}` values. The `[object Object]` tag excludes arrays, null, and
 * boxed built-ins (Date, Map, RegExp, …) that a bare `typeof` check would admit,
 * keeping this safe if reused outside `JSON.parse` output.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

/**
 * Describes a `{ key: object, ... }` map that can be flattened into a table:
 * one row per top-level key, the nested object's fields spread across columns.
 */
export interface DictTableInfo {
  /** Synthetic leading column holding each entry's top-level key. */
  keyColumn: string
  /** All columns in display order: `keyColumn` first, then nested fields. */
  columns: string[]
  /** One record per entry, shaped `{ [keyColumn]: key, ...nestedObject }`. */
  records: Record<string, unknown>[]
  /** The original top-level keys, parallel to `records`, for path building. */
  keys: string[]
}

/**
 * Detect a map of similarly-shaped records — `{ key: {…}, key: {…} }` — so it
 * can be rendered as a flat table instead of a key→"{…}" drill-in list.
 *
 * Uses the same conservative eligibility check as inferred tables. The map key
 * is only a navigation column, not evidence that its values form useful rows.
 */
export function getDictOfObjectsInfo(obj: Record<string, unknown>): DictTableInfo | null {
  const entries = Object.entries(obj)
  if (!isJsonViewTableCandidate(obj)) return null

  const seenColumns = new Set<string>()
  const nestedColumns: string[] = []

  for (const [, value] of entries) {
    if (!isPlainObject(value)) return null

    const keys = Object.keys(value)
    for (const key of keys) {
      if (!seenColumns.has(key)) {
        seenColumns.add(key)
        nestedColumns.push(key)
      }
    }
  }

  if (nestedColumns.length === 0) return null

  // Reserve a column for the map keys that can't clash with a nested field.
  let keyColumn = 'key'
  while (seenColumns.has(keyColumn)) keyColumn = `_${keyColumn}`

  const keys = entries.map(([key]) => key)
  const records = entries.map(([key, value]) => ({
    [keyColumn]: key,
    ...(value as Record<string, unknown>),
  }))

  return { keyColumn, columns: [keyColumn, ...nestedColumns], records, keys }
}
