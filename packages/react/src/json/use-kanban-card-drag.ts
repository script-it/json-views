import { useEffect, useRef, type DragEvent, type RefObject } from 'react'

type Card = { id: string, element: HTMLElement, height: number }
type Lane = { key: string, list: HTMLElement, left: number, right: number, top: number, padding: number, gap: number, cards: Card[] }
type Slot = { lane: Lane, index: number }
type Session = {
  card: Card
  lanes: Lane[]
  original: Slot
  slot?: Slot
  preview: HTMLElement
  x: number
  y: number
  frame?: number
  time?: number
  prepared: boolean
  projected: boolean
  restore: (() => void)[]
  cleanup: () => void
}

// Geometry is measured once, then projected from the current slot. Card widgets
// never rerender on hover; transform-only movement is batched to one frame.
export function useKanbanCardDrag({ boardRef, enabled, scope, onMove }: {
  boardRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  scope: string
  onMove: (id: string, group: string, before?: string) => void
}) {
  const sessionRef = useRef<Session | undefined>(undefined)
  const moveRef = useRef(onMove)
  moveRef.current = onMove

  function clear() {
    const session = sessionRef.current
    sessionRef.current = undefined
    if (!session) return
    if (session.frame !== undefined) cancelAnimationFrame(session.frame)
    session.cleanup()
    session.restore.reverse().forEach(restore => restore())
    session.card.element.removeAttribute('aria-grabbed')
  }

  useEffect(() => clear, [scope, enabled])

  function cardsIn(session: Session, lane: Lane) {
    return lane.cards.filter(card => card !== session.card)
  }

  function destination(session: Session): Slot | undefined {
    const board = boardRef.current!
    const bounds = board.getBoundingClientRect()
    if (session.x < bounds.left || session.x > bounds.right || session.y < bounds.top || session.y > bounds.bottom) return
    const x = session.x - bounds.left + board.scrollLeft
    const y = session.y - bounds.top + board.scrollTop
    // Include the narrow gutters, but not arbitrary space beyond the board.
    const lane = session.lanes.find(lane => x >= lane.left - 6 && x <= lane.right + 6)
    if (!lane) return
    const cards = cardsIn(session, lane)
    let top = lane.top + lane.padding
    for (const [index, card] of cards.entries()) {
      if (session.slot?.lane === lane && session.slot.index === index) top += session.card.height + lane.gap
      if (y < top + card.height / 2) return { lane, index }
      top += card.height + lane.gap
    }
    return { lane, index: cards.length }
  }

  function saveStyle(session: Session, element: HTMLElement) {
    const original = element.getAttribute('style')
    session.restore.push(() => {
      if (original === null) element.removeAttribute('style')
      else element.setAttribute('style', original)
    })
  }

  function prepare(session: Session) {
    if (session.prepared) return
    session.prepared = true
    const board = boardRef.current!
    saveStyle(session, board)
    // Keep short/empty lanes reachable while their cards move to another lane.
    board.style.minHeight = `${board.clientHeight}px`
    for (const lane of session.lanes) {
      saveStyle(session, lane.list)
      Object.assign(lane.list.style, { display: 'block', position: 'relative' })
      let top = lane.padding
      for (const card of lane.cards) {
        saveStyle(session, card.element)
        Object.assign(card.element.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: `${card.height}px`, transform: `translateY(${top}px)` })
        top += card.height + lane.gap
      }
    }
    session.card.element.style.opacity = '0'
    // Commit the starting geometry before enabling transitions.
    void board.offsetHeight
    board.setAttribute('data-card-reordering', 'true')
  }

  function project(session: Session, slot?: Slot) {
    if (session.projected && session.slot?.lane === slot?.lane && session.slot?.index === slot?.index) return
    session.projected = true
    session.slot = slot
    // Outside the board, restore the original arrangement until the drag returns.
    const landing = slot ?? session.original
    for (const lane of session.lanes) {
      const cards = cardsIn(session, lane)
      let top = lane.padding
      for (let index = 0; index <= cards.length; index++) {
        if (landing.lane === lane && landing.index === index) {
          lane.list.appendChild(session.preview)
          session.preview.style.transform = `translateY(${top}px)`
          top += session.card.height + lane.gap
        }
        const card = cards[index]
        if (card) {
          card.element.style.transform = `translateY(${top}px)`
          top += card.height + lane.gap
        }
      }
      lane.list.style.height = `${Math.max(lane.padding, top - lane.gap)}px`
    }
    session.preview.hidden = !slot
    session.card.element.style.opacity = slot ? '0' : ''
  }

  function paint(time: number) {
    const session = sessionRef.current
    const board = boardRef.current
    if (!session || !board) return
    session.frame = undefined
    prepare(session)
    const bounds = board.getBoundingClientRect()
    const inside = session.x >= bounds.left && session.x <= bounds.right && session.y >= bounds.top && session.y <= bounds.bottom
    const speed = (point: number, start: number, end: number) => {
      const edge = Math.min(56, (end - start) / 4)
      return point < start + edge ? -Math.min(1, (start + edge - point) / edge)
        : point > end - edge ? Math.min(1, (point - end + edge) / edge) : 0
    }
    const elapsed = Math.min(32, session.time === undefined ? 16 : time - session.time)
    session.time = time
    const left = board.scrollLeft
    const top = board.scrollTop
    if (inside) {
      board.scrollLeft = Math.max(0, board.scrollLeft + speed(session.x, bounds.left, bounds.right) * elapsed * .65)
      board.scrollTop = Math.max(0, board.scrollTop + speed(session.y, bounds.top, bounds.bottom) * elapsed * .65)
    }
    project(session, destination(session))
    if (board.scrollLeft !== left || board.scrollTop !== top) schedule()
  }

  function schedule() {
    const session = sessionRef.current
    if (session && session.frame === undefined) session.frame = requestAnimationFrame(paint)
  }

  function start(event: DragEvent<HTMLElement>, id: string) {
    const board = boardRef.current
    if (!enabled || !board) { event.preventDefault(); return }
    clear()
    const bounds = board.getBoundingClientRect()
    const lanes = Array.from(board.querySelectorAll<HTMLElement>('[data-id="jsonView-kanban-column"]')).map(element => {
      const rect = element.getBoundingClientRect()
      const list = element.querySelector<HTMLElement>('[data-id="jsonView-kanban-cards"]')!
      const style = getComputedStyle(list)
      return {
        key: element.dataset.groupKey!, list,
        left: rect.left - bounds.left + board.scrollLeft, right: rect.right - bounds.left + board.scrollLeft,
        top: list.getBoundingClientRect().top - bounds.top + board.scrollTop,
        padding: parseFloat(style.paddingTop) || 0, gap: parseFloat(style.rowGap) || 10,
        cards: Array.from(list.querySelectorAll<HTMLElement>('[data-id="jsonView-kanban-card"]')).map(element => ({ id: element.dataset.rowId!, element, height: element.getBoundingClientRect().height })),
      }
    })
    const lane = lanes.find(lane => lane.cards.some(card => card.id === id))
    const card = lane?.cards.find(card => card.id === id)
    if (!lane || !card) { event.preventDefault(); return }
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-jsonView-json-row', id)
    const preview = card.element.cloneNode(true) as HTMLElement
    // This is a visual clone, not another interactive or accessible card.
    for (const element of [preview, ...preview.querySelectorAll<HTMLElement>('*')]) {
      element.removeAttribute('id')
      element.removeAttribute('data-id')
      element.removeAttribute('data-row-id')
    }
    preview.inert = true
    preview.draggable = false
    preview.setAttribute('aria-hidden', 'true')
    preview.setAttribute('data-id', 'jsonView-kanban-card-preview')
    Object.assign(preview.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: `${card.height}px` })
    const ghost = preview.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-id')
    Object.assign(ghost.style, { position: 'fixed', left: '-10000px', width: `${card.element.getBoundingClientRect().width}px` })
    board.appendChild(ghost)
    const cardBounds = card.element.getBoundingClientRect()
    event.dataTransfer.setDragImage?.(ghost, Math.max(0, event.clientX - cardBounds.left), Math.max(0, event.clientY - cardBounds.top))
    card.element.setAttribute('aria-grabbed', 'true')
    const doc = board.ownerDocument
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear() }
    const resize = () => clear()
    const original = { lane, index: lane.cards.indexOf(card) }
    sessionRef.current = {
      card, lanes, original, slot: original, preview, x: event.clientX, y: event.clientY, prepared: false, projected: false, restore: [],
      cleanup: () => {
        board.removeAttribute('data-card-reordering')
        preview.remove()
        ghost.remove()
        doc.removeEventListener('keydown', escape, true)
        doc.removeEventListener('dragend', clear)
        doc.removeEventListener('drop', clear)
        doc.defaultView?.removeEventListener('blur', clear)
        doc.defaultView?.removeEventListener('resize', resize)
        board.removeEventListener('scroll', schedule)
      },
    }
    doc.addEventListener('keydown', escape, true)
    doc.addEventListener('dragend', clear)
    doc.addEventListener('drop', clear)
    doc.defaultView?.addEventListener('blur', clear)
    doc.defaultView?.addEventListener('resize', resize)
    board.addEventListener('scroll', schedule, { passive: true })
    schedule()
  }

  return {
    start,
    onDragEnterCapture(event: DragEvent<HTMLDivElement>) {
      if (!sessionRef.current) return
      event.preventDefault()
      event.stopPropagation()
    },
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
      const slot = destination(session)
      const before = slot && cardsIn(session, slot.lane)[slot.index]?.id
      clear()
      if (slot && (slot.lane !== session.original.lane || slot.index !== session.original.index)) moveRef.current(session.card.id, slot.lane.key, before)
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      const session = sessionRef.current
      if (!session || (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) return
      session.x = -Infinity
      if (session.prepared) project(session)
    },
  }
}
