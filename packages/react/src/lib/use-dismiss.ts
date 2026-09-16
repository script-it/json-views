import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { FLOATING_PORTAL_SELECTORS } from './floating-portal-selectors.js'
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface UseDismissOptions {
  /** When false the listeners are detached (the popup is closed). */
  enabled: boolean
  /** Called on Escape or a click outside every `insideRefs` subtree. */
  onDismiss: () => void
  /** Elements whose subtree counts as "inside" — a click within any of them
   *  (the popup itself, its anchor row, etc.) does not dismiss. Read live at
   *  event time, so the array identity may change between renders without
   *  re-subscribing the listeners. */
  insideRefs: Array<RefObject<HTMLElement | null>>
  /** Delay (ms) before arming click-outside, so the click that opened the popup
   *  doesn't immediately dismiss it. Only needed when the opening click lands
   *  outside every `insideRefs` subtree. @default 0 */
  armDelayMs?: number
  /** Also treat clicks inside any portalled `[data-anchored-popup]` layer as
   *  inside — for popups that themselves contain nested `AnchoredPopup`s (e.g.
   *  a widget dropdown), which render at `document.body` and so escape the
   *  `insideRefs` subtree checks. @default false */
  ignoreAnchoredPopups?: boolean
  /** Host-owned layers that should not dismiss this popup. */
  ignoreSelectors?: readonly string[]
}

/**
 * Click-outside + Escape dismissal for portalled popups. Treats Radix popper
 * content (menus, tooltips) — which renders at `document.body`, outside any
 * anchor subtree — as inside, so interacting with a popup's own menu never
 * dismisses it. Shared by `AnchoredPopup` and the inputs-table inline editor so
 * dismissal behaves identically across portalled surfaces.
 */
export function useDismiss({
  enabled,
  onDismiss,
  insideRefs,
  armDelayMs = 0,
  ignoreAnchoredPopups = false,
  ignoreSelectors = [],
}: UseDismissOptions): void {
  // Read `insideRefs` and `onDismiss` live inside the handler so unstable
  // identities each render (a fresh refs array, an inline `onDismiss` closure)
  // don't force the listeners to re-subscribe. Re-subscribing would also clear
  // and restart the arming timer every render, so with `armDelayMs > 0` rapid
  // renders (typing, hovering) could keep `armed` false forever and break
  // click-outside dismissal. Synced in a layout effect — before the browser
  // dispatches the next mousedown, so a click landing between commit and this
  // sync reads the current refs rather than the previous render's. Never
  // written during render, and read only inside the event handlers below.
  const insideRefsRef = useRef(insideRefs)
  const onDismissRef = useRef(onDismiss)
  useBrowserLayoutEffect(() => {
    insideRefsRef.current = insideRefs
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    if (!enabled) return

    let armed = armDelayMs === 0

    const handlePointerDown = (event: MouseEvent) => {
      if (!armed) return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (insideRefsRef.current.some((ref) => ref.current?.contains(target))) return
      if (target.closest(FLOATING_PORTAL_SELECTORS.radixPopper)) return
      if (ignoreAnchoredPopups && target.closest(FLOATING_PORTAL_SELECTORS.anchoredPopup)) return
      if (ignoreSelectors.some((selector) => target.closest(selector))) return
      onDismissRef.current()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current()
    }

    const timerId =
      armDelayMs > 0
        ? window.setTimeout(() => {
            armed = true
          }, armDelayMs)
        : undefined

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      if (timerId !== undefined) window.clearTimeout(timerId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, armDelayMs, ignoreAnchoredPopups, ignoreSelectors.join('\n')])
}
