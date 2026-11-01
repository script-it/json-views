import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { valuePathKey, type ValuePath } from '@script-it/json-views-core'

/** Finds and scrolls to the values one viewer shows. Create one per viewer and pass it as the viewer's `controller`. */
export interface JsonViewsController {
  /** The mounted element showing the value at `path`, or null. An HTML view's element sits in the view's frame, so its
   *  `getBoundingClientRect()` is relative to that frame (`ownerDocument.defaultView.frameElement`). */
  elementForPath(path: ValuePath): HTMLElement | null
  /**
   * Scrolls the value at `path` into view and resolves with its element. When
   * the open view does not show the value, it resolves with the nearest
   * ancestor it shows, such as a field's row. A virtualized table scrolls to
   * the row first. Resolves null when the view shows none of the path (another
   * view, or a search or filter hiding the row), or when no viewer is bound
   * within `timeoutMs`.
   */
  revealPath(path: ValuePath, options?: { timeoutMs?: number }): Promise<HTMLElement | null>
}

/** A table the controller can bring a row of into its virtual window. */
export interface RevealTable {
  hasRow(key: string): boolean
  scrollToRow(key: string): void
}

interface ControllerBinding {
  content: () => HTMLElement | null
  tables: ReadonlySet<RevealTable>
}

const bindings = new WeakMap<JsonViewsController, ControllerBinding>()

const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 16)
})

// Path keys are JSON, whose quotes and backslashes a CSS string must escape. An HTML view draws its values in a frame
// of its own, whose document a query of the content does not enter.
function elementWithKey(content: HTMLElement | null, key: string): HTMLElement | null {
  if (!content) return null
  const selector = `[data-json-views-path="${key.replace(/[\\"]/g, '\\$&')}"]`
  for (const scope of [content, ...Array.from(content.querySelectorAll('iframe'), (frame) => frame.contentDocument)]) {
    const element = scope?.querySelector<HTMLElement>(selector)
    if (element) return element
  }
  return null
}

export function createJsonViewsController(): JsonViewsController {
  const controller: JsonViewsController = {
    elementForPath: (path) => elementWithKey(bindings.get(controller)?.content() ?? null, valuePathKey(path)),
    revealPath: async (path, { timeoutMs = 3000 } = {}) => {
      const deadline = Date.now() + timeoutMs
      while (!bindings.get(controller)?.content()) {
        if (Date.now() > deadline) return null
        await nextFrame()
      }
      const binding = bindings.get(controller)!
      // The value itself first, then each ancestor up to the top-level value.
      const keys = path.map((_segment, index) => valuePathKey(path.slice(0, path.length - index)))
      const rowKey = keys.find((key) => [...binding.tables].some((table) => table.hasRow(key)))
      if (rowKey !== undefined && !elementWithKey(binding.content(), rowKey)) {
        for (const table of binding.tables) if (table.hasRow(rowKey)) table.scrollToRow(rowKey)
        // The virtualizer renders the row a frame or more after it scrolls.
        while (!elementWithKey(binding.content(), rowKey) && Date.now() < deadline) await nextFrame()
      }
      for (const key of keys) {
        const element = elementWithKey(binding.content(), key)
        if (!element) continue
        element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
        return element
      }
      return null
    },
  }
  return controller
}

/** A controller for one viewer, kept for the component's lifetime. */
export function useJsonViewsController(): JsonViewsController {
  const [controller] = useState(createJsonViewsController)
  return controller
}

export const RevealTablesContext = createContext<Set<RevealTable> | null>(null)

/** Binds `controller`, while mounted, to the viewer whose values `content` holds; returns the set its tables join. */
export function useBindController(controller: JsonViewsController | undefined, content: RefObject<HTMLElement | null>): Set<RevealTable> {
  const [tables] = useState(() => new Set<RevealTable>())
  useEffect(() => {
    if (!controller) return
    const binding: ControllerBinding = { content: () => content.current, tables }
    bindings.set(controller, binding)
    return () => {
      if (bindings.get(controller) === binding) bindings.delete(controller)
    }
  }, [content, controller, tables])
  return tables
}

/** Lets the viewer's controller scroll this table to a row, while the table is mounted. */
export function useRevealTable(table: RevealTable): void {
  const tables = useContext(RevealTablesContext)
  const latest = useRef(table)
  useLayoutEffect(() => {
    latest.current = table
  })
  useEffect(() => {
    if (!tables) return
    const entry: RevealTable = {
      hasRow: (key) => latest.current.hasRow(key),
      scrollToRow: (key) => latest.current.scrollToRow(key),
    }
    tables.add(entry)
    return () => {
      tables.delete(entry)
    }
  }, [tables])
}
