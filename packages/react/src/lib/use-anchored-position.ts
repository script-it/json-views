import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const PADDING = 8
const GAP = 4

/** Fixed popovers use viewport coordinates and stay within its visible edges. */
export function useAnchoredPosition(
  enabled: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  side: 'bottom' | 'right' = 'bottom',
  align: 'start' | 'end' = 'start',
  /** Floors the content at the anchor's width, for an editor that replaces it. */
  matchAnchorWidth = false,
): CSSProperties {
  const [position, setPosition] = useState<{ left: number; top: number; minWidth?: number }>()
  const update = () => {
    const anchor = anchorRef.current
    const content = contentRef.current
    if (!enabled || !anchor || !content) return
    const local = anchor.getBoundingClientRect()
    const frame = anchor.ownerDocument.defaultView?.frameElement
    const offset = frame?.getBoundingClientRect()
    const bounds = { left: local.left + (offset?.left ?? 0), right: local.right + (offset?.left ?? 0), top: local.top + (offset?.top ?? 0), bottom: local.bottom + (offset?.top ?? 0) }
    const size = content.getBoundingClientRect()
    const width = Math.min(size.width, window.innerWidth - PADDING * 2)
    const height = Math.min(size.height, window.innerHeight - PADDING * 2)
    const fitsBelow = bounds.bottom + GAP + height <= window.innerHeight - PADDING
    const fitsRight = bounds.right + GAP + width <= window.innerWidth - PADDING
    const left = side === 'right'
      ? fitsRight ? bounds.right + GAP : bounds.left - width - GAP
      : align === 'end' ? bounds.right - width : bounds.left
    const top = side === 'bottom'
      ? fitsBelow ? bounds.bottom + GAP : bounds.top - height - GAP
      : bounds.top
    const next = {
      left: Math.max(PADDING, Math.min(left, window.innerWidth - width - PADDING)),
      top: Math.max(PADDING, Math.min(top, window.innerHeight - height - PADDING)),
      minWidth: matchAnchorWidth ? Math.min(bounds.right - bounds.left, window.innerWidth - PADDING * 2) : undefined,
    }
    setPosition((current) => current?.left === next.left && current.top === next.top && current.minWidth === next.minWidth ? current : next)
  }

  useBrowserLayoutEffect(update)
  useEffect(() => {
    if (!enabled) return
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    if (contentRef.current) observer?.observe(contentRef.current)
    anchorRef.current?.ownerDocument.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      anchorRef.current?.ownerDocument.removeEventListener('scroll', update, true)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [enabled, anchorRef, contentRef, side, align, matchAnchorWidth])

  return {
    position: 'fixed',
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    minWidth: position?.minWidth,
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
  }
}
