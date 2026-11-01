import { createContext, useContext } from 'react'
import { valuePathKey, type ValuePath } from '@script-it/json-views-core'

/** A host's label on one value. `kind` is a token without whitespace. */
export interface JsonViewsMark {
  path: ValuePath
  kind: string
}

/** The kinds the host marks on each value, by path key: sorted and space-joined. */
export type ValueMarks = ReadonlyMap<string, string>

const NO_MARKS: ValueMarks = new Map()

export const ValueMarksContext = createContext<ValueMarks>(NO_MARKS)

export function useValueMarks(): ValueMarks {
  return useContext(ValueMarksContext)
}

/** Host marks by path key; the same marks in any order index alike. */
export function indexValueMarks(marks: readonly JsonViewsMark[] | undefined): ValueMarks {
  if (!marks?.length) return NO_MARKS
  const kinds = new Map<string, Set<string>>()
  for (const mark of marks) {
    const key = valuePathKey(mark.path)
    kinds.set(key, (kinds.get(key) ?? new Set()).add(mark.kind))
  }
  return new Map([...kinds].map(([key, set]) => [key, [...set].sort().join(' ')]))
}

/** The attributes of an element that shows the value at `path`: its path key, and the host's marks on that value. */
export function valueElementAttributes(path: ValuePath | undefined, marks: ValueMarks): {
  'data-json-views-path'?: string
  'data-json-views-mark'?: string
} {
  if (!path) return {}
  const key = valuePathKey(path)
  const mark = marks.get(key)
  return mark ? { 'data-json-views-path': key, 'data-json-views-mark': mark } : { 'data-json-views-path': key }
}
