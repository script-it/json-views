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

function pathOf(element: HTMLElement): ValuePath {
  return JSON.parse(element.getAttribute('data-json-views-path') ?? '[]') as ValuePath
}

/**
 * The content area's handlers while `onPick` is set. A click, Enter or Space
 * inside a value reports the innermost value instead of acting on it; a click
 * that ends a mouse selection reports the value holding all of the selection,
 * and nothing when the selection spans values. Drags out of values do not
 * start, and a press on a bound control neither focuses nor changes it.
 * Presses outside values, such as on tabs, search or column headers, keep
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
        if (holder) onPick({ path: pathOf(holder), element: holder, selection: { text: selection!.toString(), range } })
        return
      }
      onPick({ path: pathOf(element), element })
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const element = pickedElement(event.target)
      if (!element) return
      event.preventDefault()
      event.stopPropagation()
      onPick({ path: pathOf(element), element })
    },
    onDragStartCapture: (event: DragEvent<HTMLElement>) => {
      if (pickedElement(event.target)) event.preventDefault()
    },
    // A bound control would take focus, or change on the press itself as a range does; its click picks it instead.
    onMouseDownCapture: (event: MouseEvent<HTMLElement>) => {
      if (pickedElement(event.target)?.matches(TEXT_ENTRY)) event.preventDefault()
    },
  }, [onPick])
}
