import { useEffect, useRef, type DragEvent } from 'react'

type Column = { key: string, element: HTMLElement, left: number, right: number }
type Destination = { key: string, position: 'before' | 'after', x: number }
type DragSession = {
  key: string
  source: HTMLElement
  columns: Column[]
  height: number
  x: number
  y: number
  frame?: number
  previousTime?: number
  cleanup: () => void
}

// Measure the stationary columns once. Hovering never changes their geometry or
// renders the cards; only the insertion marker moves, at most once per frame.
export function useKanbanColumnDrag({ enabled, scope, onMove }: {
  enabled: boolean
  scope: string
  onMove: (source: string, target: string, position: 'before' | 'after') => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | undefined>(undefined)
  const moveRef = useRef(onMove)
  moveRef.current = onMove

  function clear() {
    const session = sessionRef.current
    sessionRef.current = undefined
    boardRef.current?.removeAttribute('data-column-reordering')
    if (markerRef.current) markerRef.current.hidden = true
    if (!session) return
    if (session.frame !== undefined) cancelAnimationFrame(session.frame)
    session.source.removeAttribute('data-column-dragging')
    session.cleanup()
  }

  useEffect(() => clear, [scope, enabled])

  function destination(session: DragSession): Destination | undefined {
    const board = boardRef.current
    if (!board) return
    const bounds = board.getBoundingClientRect()
    if (session.x < bounds.left || session.x > bounds.right || session.y < bounds.top || session.y > bounds.bottom) return
    const x = session.x - bounds.left + board.scrollLeft
    const remaining = session.columns.filter(column => column.key !== session.key)
    let index = remaining.findIndex(column => x < (column.left + column.right) / 2)
    if (index < 0) index = remaining.length
    // Dropping back in the original slot is a no-op, including either adjacent gap.
    if (index === session.columns.findIndex(column => column.key === session.key)) return
    const next = remaining[index]
    const previous = remaining[index - 1]
    if (next) return { key: next.key, position: 'before', x: Math.max(2, next.left - 6) }
    if (previous) return { key: previous.key, position: 'after', x: previous.right + 6 }
  }

  function paint(time: number) {
    const session = sessionRef.current
    const board = boardRef.current
    const marker = markerRef.current
    if (!session || !board || !marker) return
    session.frame = undefined
    const bounds = board.getBoundingClientRect()
    const inside = session.x >= bounds.left && session.x <= bounds.right && session.y >= bounds.top && session.y <= bounds.bottom
    const edge = Math.min(64, bounds.width / 4)
    const speed = !inside ? 0 : session.x < bounds.left + edge
      ? -Math.min(1, (bounds.left + edge - session.x) / edge)
      : session.x > bounds.right - edge ? Math.min(1, (session.x - bounds.right + edge) / edge) : 0
    const elapsed = Math.min(32, session.previousTime === undefined ? 16 : time - session.previousTime)
    session.previousTime = time
    const beforeScroll = board.scrollLeft
    if (speed) board.scrollLeft += speed * elapsed * 0.65
    const target = destination(session)
    marker.hidden = !target
    if (target) {
      marker.style.transform = `translateX(${target.x}px)`
      marker.style.top = `${board.scrollTop + 12}px`
      marker.style.height = `${Math.max(40, Math.min(board.clientHeight - 24, session.height))}px`
      marker.dataset.position = target.position
      marker.dataset.target = target.key
    }
    if (speed && beforeScroll !== board.scrollLeft) session.frame = requestAnimationFrame(paint)
  }

  function schedule() {
    const session = sessionRef.current
    if (session && session.frame === undefined) session.frame = requestAnimationFrame(paint)
  }

  function start(event: DragEvent<HTMLElement>, key: string) {
    if (!enabled || !boardRef.current) { event.preventDefault(); return }
    clear()
    const board = boardRef.current
    const bounds = board.getBoundingClientRect()
    const columns = Array.from(board.querySelectorAll<HTMLElement>('[data-id="jsonView-kanban-column"]')).map(element => {
      const rect = element.getBoundingClientRect()
      return { key: element.dataset.groupKey!, element, left: rect.left - bounds.left + board.scrollLeft, right: rect.right - bounds.left + board.scrollLeft }
    })
    const source = columns.find(column => column.key === key)?.element
    if (!source) { event.preventDefault(); return }
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-jsonView-kanban-group', key)
    // A compact, opaque header preview follows the cursor instead of a tiny grip
    // or a ghost containing hundreds of cards.
    const header = event.currentTarget
    const ghost = header.cloneNode(true) as HTMLElement
    ghost.setAttribute('aria-hidden', 'true')
    ghost.removeAttribute('data-id')
    ghost.className = 'flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-lg'
    Object.assign(ghost.style, { position: 'fixed', top: '-10000px', left: '0', width: `${source.offsetWidth}px`, height: '40px', pointerEvents: 'none' })
    board.appendChild(ghost)
    event.dataTransfer.setDragImage?.(ghost, Math.max(0, Math.min(source.offsetWidth, event.clientX - source.getBoundingClientRect().left)), 20)
    source.setAttribute('data-column-dragging', 'true')
    board.setAttribute('data-column-reordering', 'true')
    const doc = board.ownerDocument
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear() }
    const leaveWindow = () => clear()
    doc.addEventListener('keydown', escape, true)
    doc.addEventListener('dragend', clear)
    doc.addEventListener('drop', clear)
    doc.defaultView?.addEventListener('blur', leaveWindow)
    board.addEventListener('scroll', schedule, { passive: true })
    sessionRef.current = {
      key, source, columns, height: Math.max(...columns.map(column => column.element.offsetHeight)), x: event.clientX, y: event.clientY,
      cleanup: () => {
        ghost.remove()
        doc.removeEventListener('keydown', escape, true)
        doc.removeEventListener('dragend', clear)
        doc.removeEventListener('drop', clear)
        doc.defaultView?.removeEventListener('blur', leaveWindow)
        board.removeEventListener('scroll', schedule)
      },
    }
  }

  return {
    boardRef, markerRef, start,
    onDragEnterCapture(event: DragEvent<HTMLDivElement>) {
      if (!sessionRef.current) return
      event.preventDefault()
      event.stopPropagation()
    },
    // Capture prevents card drop handlers from swallowing a column drop. The
    // entire board, including gaps and the space below short lanes, is a target.
    onDragOverCapture(event: DragEvent<HTMLDivElement>) {
      const session = sessionRef.current
      if (!session) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      session.x = event.clientX
      session.y = event.clientY
      schedule()
    },
    onDropCapture(event: DragEvent<HTMLDivElement>) {
      const session = sessionRef.current
      if (!session) return
      event.preventDefault()
      event.stopPropagation()
      session.x = event.clientX
      session.y = event.clientY
      const target = destination(session)
      clear()
      if (target) moveRef.current(session.key, target.key, target.position)
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (!sessionRef.current || (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX > bounds.left && event.clientX < bounds.right && event.clientY > bounds.top && event.clientY < bounds.bottom) return
      sessionRef.current.x = -Infinity
      if (markerRef.current) markerRef.current.hidden = true
    },
  }
}
