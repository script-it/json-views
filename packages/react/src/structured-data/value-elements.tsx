import { createContext, useContext } from 'react'
import { valuePathKey, type ValuePath } from '@script-it/json-views-core'

/** A value the host highlights: `strong` for what the reader is working on now, `subtle` for what is kept. */
export interface JsonViewsHighlight {
  path: ValuePath
  emphasis: 'strong' | 'subtle'
}

/** The emphasis on each highlighted value, by path key. */
export type ValueHighlights = ReadonlyMap<string, JsonViewsHighlight['emphasis']>

const NO_HIGHLIGHTS: ValueHighlights = new Map()

export const ValueHighlightsContext = createContext<ValueHighlights>(NO_HIGHLIGHTS)

export function useValueHighlights(): ValueHighlights {
  return useContext(ValueHighlightsContext)
}

/** Highlights by path key. A value highlighted both ways is strong. */
export function indexValueHighlights(highlights: readonly JsonViewsHighlight[] | undefined): ValueHighlights {
  if (!highlights?.length) return NO_HIGHLIGHTS
  const index = new Map<string, JsonViewsHighlight['emphasis']>()
  for (const { path, emphasis } of highlights) {
    const key = valuePathKey(path)
    if (index.get(key) !== 'strong') index.set(key, emphasis)
  }
  return index
}

/** The attributes of an element that shows the value at `path`: its path key, and its highlight, which the viewer's
 *  styles draw on the page and in an HTML view's frame. */
export function valueElementAttributes(path: ValuePath | undefined, highlights: ValueHighlights): {
  'data-json-views-path'?: string
  'data-json-views-highlight'?: JsonViewsHighlight['emphasis']
} {
  if (!path) return {}
  const key = valuePathKey(path)
  const emphasis = highlights.get(key)
  return emphasis ? { 'data-json-views-path': key, 'data-json-views-highlight': emphasis } : { 'data-json-views-path': key }
}
