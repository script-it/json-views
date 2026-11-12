import { createContext, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ForwardedRef, type RefObject } from 'react'
import { valuePathKey, type ValuePath } from '@script-it/json-views-core'

/** What a viewer's `ref` holds while it is mounted, to find and scroll to its values. */
export interface JsonViewsHandle {
  /**
   * Scrolls the value at `path` into view, a virtualized table to its row
   * first, and resolves with the path it showed: the value's own or, when the
   * open view does not show the value, the nearest ancestor it shows, such as a
   * field's row, or the tab of the view that declares a column. With `flash`,
   * what it showed pulses once. Resolves null when the view shows none of the
   * path (another view, or a search or filter hiding the row). It waits at most
   * `timeoutMs` (default 3000) for a row it scrolled to to render.
   */
  reveal(path: ValuePath, options?: { flash?: boolean; timeoutMs?: number }): Promise<ValuePath | null>
  /** The box of the mounted element showing the value at `path`, relative to the host page's viewport as
   *  `getBoundingClientRect()` is, a value in an HTML view's frame too; null when none is mounted. */
  rectOf(path: ValuePath): DOMRect | null
}

/** A table the handle can bring a row of into its virtual window. */
export interface RevealTable {
  hasRow(key: string): boolean
  scrollToRow(key: string): void
}

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

/** The element's box on `page`: an element in an HTML view's frame is measured in the frame, offset by the frame's
 *  own box and border. */
function boxOnPage(element: HTMLElement, page: Document): DOMRect {
  const box = element.getBoundingClientRect()
  const frame = element.ownerDocument === page ? null : element.ownerDocument.defaultView?.frameElement
  if (!frame) return box
  const origin = frame.getBoundingClientRect()
  return new DOMRect(box.x + origin.x + frame.clientLeft, box.y + origin.y + frame.clientTop, box.width, box.height)
}

const FLASH_ATTRIBUTE = 'data-json-views-flash'
/** As long as the flash's animation in the viewer's styles, on the page and in an HTML view's frame. */
const FLASH_MS = 1600
const flashTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

function flash(element: HTMLElement): void {
  const pending = flashTimers.get(element)
  if (pending !== undefined) clearTimeout(pending)
  // Taking the attribute off and laying the element out restarts a flash that is still playing.
  element.removeAttribute(FLASH_ATTRIBUTE)
  void element.offsetWidth
  element.setAttribute(FLASH_ATTRIBUTE, '')
  flashTimers.set(element, setTimeout(() => {
    element.removeAttribute(FLASH_ATTRIBUTE)
    flashTimers.delete(element)
  }, FLASH_MS))
}

/** Gives `ref` the viewer's handle, over the values `content` holds; returns the set its tables join. */
export function useViewerHandle(ref: ForwardedRef<JsonViewsHandle>, content: RefObject<HTMLElement | null>): Set<RevealTable> {
  const [tables] = useState(() => new Set<RevealTable>())
  useImperativeHandle(ref, () => {
    const find = (key: string) => elementWithKey(content.current, key)
    return {
      rectOf: (path) => {
        const element = find(valuePathKey(path))
        return element && content.current ? boxOnPage(element, content.current.ownerDocument) : null
      },
      reveal: async (path, { flash: pulse = false, timeoutMs = 3000 } = {}) => {
        const deadline = Date.now() + timeoutMs
        // The value itself first, then each ancestor up to the top-level value.
        const paths = path.length === 0 ? [path] : path.map((_segment, index) => path.slice(0, path.length - index))
        const keys = paths.map(valuePathKey)
        const rowKey = keys.find((key) => [...tables].some((table) => table.hasRow(key)))
        if (rowKey !== undefined && !find(rowKey)) {
          for (const table of tables) if (table.hasRow(rowKey)) table.scrollToRow(rowKey)
          // The virtualizer renders the row a frame or more after it scrolls.
          while (!find(rowKey) && Date.now() < deadline) await nextFrame()
        }
        for (const [index, key] of keys.entries()) {
          const element = find(key)
          if (!element) continue
          element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          if (pulse) flash(element)
          return paths[index]
        }
        return null
      },
    }
  }, [content, tables])
  return tables
}

export const RevealTablesContext = createContext<Set<RevealTable> | null>(null)

/** Lets the viewer's handle scroll this table to a row, while the table is mounted. */
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
