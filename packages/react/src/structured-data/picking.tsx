import { createContext, useContext, useMemo, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import type { ValuePath } from '@script-it/json-views-core'

/** A value the reader picked while the host's `onPick` is set. */
export interface JsonViewsPick {
  /** The value's source path, as its element's `data-json-views-path` names it. */
  path: ValuePath
  /** The element showing the value. A virtualized row can unmount it; `JsonViewsController.elementForPath` finds it again. */
  element: HTMLElement
  /** The text selected inside the value, when the pick ends a mouse selection. */
  selection?: { text: string; range: Range }
  /** The name the element shows for a view or column declared in the document's `$jsonviews`, whose declaration is
   *  `path`: a view's tab or a column's header. Values carry none. */
  label?: string
}

/** Whether presses on values pick them instead of acting on them. */
export const PickingContext = createContext(false)

export function usePicking(): boolean {
  return useContext(PickingContext)
}

const VALUE = '[data-json-views-path]'
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
/** Marks a row's leading icon: a press there picks the row rather than the cell holding the icon. */
export const ROW_PICKER_ATTRIBUTE = 'data-json-views-pick-row'
/** Names the view or column a declaration's element stands for: a view's tab, a column's header. Such an element picks
 *  as a whole, and while the viewer picks, its own controls (a tab's activation, a header's menu, resize handle and
 *  drag) do not act. */
export const DECLARATION_LABEL_ATTRIBUTE = 'data-json-views-label'

/** The attribute naming the view or column a declaration's element stands for; the element's path is the declaration's. */
export function declarationElementAttributes(label: string): { [DECLARATION_LABEL_ATTRIBUTE]: string } {
  return { [DECLARATION_LABEL_ATTRIBUTE]: label }
}

/** The node as an element, also when it sits in an HTML view's frame, whose elements `instanceof Element` does not
 *  recognize. */
function asElement(node: EventTarget | Node | null): Element | null {
  return node && (node as Node).nodeType === Node.ELEMENT_NODE ? node as Element : null
}

/** The element of the value a press on `target` picks: the innermost value, or the row for its leading icon. An open
 *  editor's own controls pick nothing; a control that is a value's element itself, as an HTML view's bound input is,
 *  picks its value. */
function pickedElement(target: EventTarget | null): HTMLElement | null {
  const element = asElement(target)
  const entry = element?.closest(TEXT_ENTRY)
  if (!element || entry && !entry.matches(VALUE)) return null
  const start = element.closest(`[${ROW_PICKER_ATTRIBUTE}]`)?.closest('tr') ?? element
  return start.closest<HTMLElement>(VALUE)
}

/** The pick of a value's element: its path, and the name it shows when it stands for a declaration. */
function pickOf(element: HTMLElement): JsonViewsPick {
  const path = JSON.parse(element.getAttribute('data-json-views-path') ?? '[]') as ValuePath
  const label = element.getAttribute(DECLARATION_LABEL_ATTRIBUTE)
  return label === null ? { path, element } : { path, element, label }
}

/**
 * The viewer's handlers while `onPick` is set. A click, Enter or Space inside
 * a value reports the innermost value instead of acting on it; a click that
 * ends a mouse selection reports the value holding all of the selection, and
 * nothing when the selection spans values. Drags out of values do not start,
 * and a press on a bound control neither focuses nor changes it. A view's tab
 * and a declared column's header are the values of their declarations in the
 * document's `$jsonviews`: a press on one picks it whole and neither switches
 * the view nor opens, resizes or drags the column. Presses outside values, such
 * as on the root and Source tabs, search or an inferred column's header, keep
 * their own behavior. An HTML view's presses reach these handlers through its
 * portal into its frame.
 */
export function usePickHandlers(onPick: ((pick: JsonViewsPick) => void) | undefined) {
  return useMemo(() => onPick && {
    'data-json-views-picking': '',
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      const element = pickedElement(event.target)
      if (!element) return
      event.preventDefault()
      event.stopPropagation()
      const content = event.currentTarget
      const page = element.ownerDocument
      const selection = page.getSelection()
      const range = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      // An HTML view's frame holds only this viewer's values; on the host's page the selection must sit in the content.
      if (range && (page !== content.ownerDocument || content.contains(range.commonAncestorContainer))) {
        const common = range.commonAncestorContainer
        const holder = (asElement(common) ?? common.parentElement)?.closest<HTMLElement>(VALUE)
        if (holder) onPick({ ...pickOf(holder), selection: { text: selection!.toString(), range } })
        return
      }
      onPick(pickOf(element))
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const element = pickedElement(event.target)
      if (!element) return
      event.preventDefault()
      event.stopPropagation()
      onPick(pickOf(element))
    },
    onDragStartCapture: (event: DragEvent<HTMLElement>) => {
      if (pickedElement(event.target)) event.preventDefault()
    },
    // A bound control would take focus, or change on the press itself as a range does; its click picks it instead. A
    // tab activates on the press, and a header's resize handle starts on it, so a declaration's element keeps it too.
    onMouseDownCapture: (event: MouseEvent<HTMLElement>) => {
      const element = pickedElement(event.target)
      if (!element) return
      if (element.hasAttribute(DECLARATION_LABEL_ATTRIBUTE)) {
        event.preventDefault()
        event.stopPropagation()
      } else if (element.matches(TEXT_ENTRY)) {
        event.preventDefault()
      }
    },
  }, [onPick])
}
