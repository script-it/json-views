// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { useKanbanColumnDrag } from './use-kanban-column-drag.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); vi.restoreAllMocks() })

async function setup() {
  const move = vi.fn()
  const cardDrop = vi.fn()
  let renderCount = 0
  function Board() {
    renderCount++
    const drag = useKanbanColumnDrag({ enabled: true, scope: 'board', onMove: move })
    return <div ref={drag.boardRef} onDragEnterCapture={drag.onDragEnterCapture} onDragOverCapture={drag.onDragOverCapture} onDropCapture={drag.onDropCapture} onDragLeave={drag.onDragLeave}>
      <div ref={drag.markerRef} hidden data-marker />
      {['A', 'B', 'C', 'D'].map(key => <section key={key} data-id="jsonView-kanban-column" data-group-key={key}>
        <header draggable onDragStart={event => drag.start(event, key)}>{key}</header>
        <article onDrop={event => { event.stopPropagation(); cardDrop() }}>Card in {key}</article>
      </section>)}
    </div>
  }
  rendered = await renderComponent(<Board />)
  const board = rendered.container.firstElementChild as HTMLElement
  const columns = Array.from(board.querySelectorAll('section'))
  const marker = board.querySelector<HTMLElement>('[data-marker]')!
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
  vi.spyOn(board, 'clientHeight', 'get').mockReturnValue(600)
  columns.forEach((column, index) => {
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 268, 12, 256, 400))
    vi.spyOn(column, 'offsetHeight', 'get').mockReturnValue(400)
  })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const transfer = { setData: vi.fn(), setDragImage: vi.fn(), getData: () => '' }
  const dispatch = (element: Element, type: string, x: number, y = 100) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    element.dispatchEvent(event)
  }
  const frame = () => {
    const callbacks = Array.from(frames.values())
    frames.clear()
    callbacks.forEach(callback => callback(16))
  }
  const start = (index = 0) => dispatch(columns[index].querySelector('header')!, 'dragstart', index * 268 + 24)
  return { board, columns, marker, move, cardDrop, dispatch, start, frame, frames, renderCount: () => renderCount }
}

it('drops a column over a card using the final pointer position, without moving the card', async () => {
  const s = await setup()
  s.start()
  const card = s.columns[2].querySelector('article')!
  s.dispatch(card, 'dragover', 550)
  s.frame()
  expect(s.marker.dataset.position).toBe('before')
  // The pointer crosses the midpoint immediately before release, before a frame.
  s.dispatch(card, 'drop', 750)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A', 'D', 'before')
  expect(s.cardDrop).not.toHaveBeenCalled()
  expect(s.marker.hidden).toBe(true)
  expect(s.columns[0].hasAttribute('data-column-dragging')).toBe(false)
  expect(s.board.hasAttribute('data-column-reordering')).toBe(false)
})

it('accepts the gap between columns and space below short columns', async () => {
  const s = await setup()
  s.start(3)
  s.dispatch(s.board, 'drop', 262, 500)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('D', 'B', 'before')
})

it('does not save or show a misleading marker in the original slot', async () => {
  const s = await setup()
  s.start(1)
  s.dispatch(s.board, 'dragover', 262)
  s.frame()
  expect(s.marker.hidden).toBe(true)
  s.dispatch(s.board, 'drop', 300)
  expect(s.move).not.toHaveBeenCalled()
})

it('updates only one marker per frame, without rendering the board or remeasuring columns', async () => {
  const s = await setup()
  s.start()
  const renders = s.renderCount()
  for (let x = 550; x < 650; x++) s.dispatch(s.board, 'dragover', x)
  expect(s.frames.size).toBe(1)
  s.frame()
  expect(s.marker.hidden).toBe(false)
  expect(s.marker.style.transform).toBe('translateX(530px)')
  expect(s.renderCount()).toBe(renders)
  expect(s.columns[2].getBoundingClientRect).toHaveBeenCalledTimes(1)
})

it('clears stale feedback on leaving, and cancels an outside drop without saving', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 550)
  s.frame()
  s.dispatch(s.board, 'dragleave', -10)
  expect(s.marker.hidden).toBe(true)
  s.dispatch(document.body, 'drop', -10)
  expect(s.columns[0].hasAttribute('data-column-dragging')).toBe(false)
  expect(s.move).not.toHaveBeenCalled()
  expect(s.frames.size).toBe(0)
})

it('cancels with Escape and lets the next drag start cleanly', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 550)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(s.frames.size).toBe(0)
  s.dispatch(s.board, 'drop', 550)
  expect(s.move).not.toHaveBeenCalled()
  s.start(2)
  s.dispatch(s.board, 'drop', 100)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('C', 'A', 'before')
})

it('scrolls at the edge, stops on exit, and accounts for scroll when choosing a slot', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 795)
  s.frame()
  expect(s.board.scrollLeft).toBeGreaterThan(0)
  expect(s.frames.size).toBe(1)
  s.dispatch(s.board, 'dragleave', 900)
  const scroll = s.board.scrollLeft
  s.frame()
  expect(s.board.scrollLeft).toBe(scroll)
  expect(s.frames.size).toBe(0)
  s.board.scrollLeft = 268
  s.dispatch(s.board, 'drop', 470)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A', 'D', 'before')
})

it('does not intercept card drags or foreign drops', async () => {
  const s = await setup()
  s.dispatch(s.columns[1].querySelector('article')!, 'drop', 400)
  expect(s.cardDrop).toHaveBeenCalledOnce()
  expect(s.move).not.toHaveBeenCalled()
})

it('cleans up a cancelled drag when the board unmounts', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 550)
  await rendered?.cleanup()
  rendered = undefined
  expect(s.frames.size).toBe(0)
  expect(s.columns[0].hasAttribute('data-column-dragging')).toBe(false)
  s.dispatch(document.body, 'drop', 550)
  expect(s.move).not.toHaveBeenCalled()
})
