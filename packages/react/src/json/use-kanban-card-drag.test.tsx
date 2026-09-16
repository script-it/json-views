// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { useKanbanCardDrag } from './use-kanban-card-drag.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks() })

async function setup() {
  const move = vi.fn()
  let renders = 0
  function Board() {
    renders++
    const boardRef = useRef<HTMLDivElement>(null)
    const drag = useKanbanCardDrag({ boardRef, enabled: true, scope: 'board', onMove: move })
    return <div ref={boardRef} onDragEnterCapture={drag.onDragEnterCapture} onDragOverCapture={drag.onDragOverCapture} onDropCapture={drag.onDropCapture} onDragLeave={drag.onDragLeave}>
      {['A', 'B', 'Empty'].map((key, lane) => <section key={key} data-id="jsonView-kanban-column" data-group-key={key}>
        <header>{key}</header>
        <div data-id="jsonView-kanban-cards" style={{ paddingTop: 6, rowGap: 10 }}>
          {(lane === 2 ? [] : ['1', '2', '3']).map((id) => <article key={id} data-id="jsonView-kanban-card" data-row-id={key + id} draggable onDragStart={event => drag.start(event, key + id)}>
            <button id={key + id}>Card {key + id}</button>
          </article>)}
        </div>
      </section>)}
    </div>
  }
  rendered = await renderComponent(<Board />)
  const board = rendered.container.firstElementChild as HTMLElement
  const lanes = Array.from(board.querySelectorAll('section'))
  const cards = Array.from(board.querySelectorAll<HTMLElement>('article'))
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
  vi.spyOn(board, 'clientHeight', 'get').mockReturnValue(600)
  lanes.forEach((lane, index) => {
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 268, 12, 256, 430))
    vi.spyOn(lane.querySelector('[data-id="jsonView-kanban-cards"]')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 268 + 10, 44, 236, 386))
    let y = 50
    lane.querySelectorAll('article').forEach((card, i) => {
      const height = i === 1 ? 160 : 100
      vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 268 + 10, y, 236, height))
      y += height + 10
    })
  })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const transfer = { setData: vi.fn(), setDragImage: vi.fn() }
  const dispatch = (element: Element, type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    element.dispatchEvent(event)
  }
  let time = 0
  const frame = () => { time += 16; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)) }
  const start = (index = 0) => {
    const rect = cards[index].getBoundingClientRect()
    dispatch(cards[index], 'dragstart', rect.left + 20, rect.top + 20)
    frame()
  }
  const preview = () => board.querySelector<HTMLElement>('[data-id="jsonView-kanban-card-preview"]')
  return { board, lanes, cards, move, dispatch, frame, start, preview, frames, renders: () => renders }
}

it('shifts cards into a live end slot with a same-sized, noninteractive preview and no drop text', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.cards[2].querySelector('button')!, 'dragover', 100, 440)
  s.frame()
  expect(s.cards[1].style.transform).toBe('translateY(6px)')
  expect(s.cards[2].style.transform).toBe('translateY(176px)')
  expect(s.preview()?.style.transform).toBe('translateY(286px)')
  expect(s.preview()?.style.height).toBe('100px')
  expect(s.preview()?.getAttribute('aria-hidden')).toBe('true')
  expect(s.preview()?.inert).toBe(true)
  expect(s.preview()?.querySelector('[id]')).toBeNull()
  expect(s.board.textContent).not.toContain('Drop')
  s.dispatch(s.board, 'drop', 100, 440)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A1', 'A', undefined)
  expect(s.preview()).toBeNull()
  expect(s.cards.every(card => !card.hasAttribute('style'))).toBe(true)
})

it('keeps a stable middle slot when hovering the displaced card, then moves back up', async () => {
  const s = await setup()
  s.start()
  for (let i = 0; i < 5; i++) {
    s.dispatch(s.cards[1], 'dragover', 100, 270)
    s.frame()
    expect(s.preview()?.style.transform).toBe('translateY(176px)')
  }
  s.dispatch(s.board, 'dragover', 100, 100)
  s.frame()
  expect(s.preview()?.style.transform).toBe('translateY(6px)')
  s.dispatch(s.board, 'drop', 100, 100)
  expect(s.move).not.toHaveBeenCalled()
})

it('previews before/after positions across columns, including an empty column', async () => {
  const s = await setup()
  s.start(1)
  s.dispatch(s.board, 'dragover', 400, 140)
  s.frame()
  expect(s.preview()?.closest('section')).toBe(s.lanes[1])
  expect(s.preview()?.style.height).toBe('160px')
  expect(s.preview()?.style.transform).toBe('translateY(116px)')
  expect(s.cards[4].style.transform).toBe('translateY(286px)')
  s.dispatch(s.board, 'dragover', 650, 200)
  s.frame()
  expect(s.preview()?.closest('section')).toBe(s.lanes[2])
  expect(s.preview()?.style.transform).toBe('translateY(6px)')
  s.dispatch(s.board, 'drop', 650, 200)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A2', 'Empty', undefined)
})

it('uses the last pointer position on a fast drop before the next paint', async () => {
  const s = await setup()
  s.start(2)
  s.dispatch(s.board, 'dragover', 400, 60)
  s.frame()
  s.dispatch(s.board, 'drop', 400, 500)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A3', 'B', undefined)
})

it('does not render widgets, remeasure cards or change source while previewing', async () => {
  const s = await setup()
  s.start()
  const renders = s.renders()
  const measurements = vi.mocked(s.cards[1].getBoundingClientRect).mock.calls.length
  for (let y = 250; y < 280; y++) s.dispatch(s.board, 'dragover', 100, y)
  expect(s.frames.size).toBe(1)
  s.frame()
  expect(s.renders()).toBe(renders)
  expect(s.cards[1].getBoundingClientRect).toHaveBeenCalledTimes(measurements)
  expect(s.move).not.toHaveBeenCalled()
})

it('restores the original layout when leaving, then accepts reentry', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 400, 500)
  s.frame()
  s.dispatch(s.board, 'dragleave', -20, 200)
  expect(s.preview()?.hidden).toBe(true)
  expect(s.cards[1].style.transform).toBe('translateY(116px)')
  s.dispatch(s.board, 'dragover', 400, 60)
  s.frame()
  expect(s.preview()?.hidden).toBe(false)
  s.dispatch(s.board, 'drop', 400, 60)
  expect(s.move).toHaveBeenCalledExactlyOnceWith('A1', 'B', 'B1')
})

it.each(['escape', 'outside', 'dragend', 'blur', 'resize', 'unmount'])('cleans up on %s without committing', async reason => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 400, 250)
  s.frame()
  if (reason === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  if (reason === 'outside') s.dispatch(document.body, 'drop', -20, 200)
  if (reason === 'dragend') s.dispatch(s.cards[0], 'dragend', 100, 200)
  if (reason === 'blur' || reason === 'resize') window.dispatchEvent(new Event(reason))
  if (reason === 'unmount') { await rendered?.cleanup(); rendered = undefined }
  expect(s.move).not.toHaveBeenCalled()
  expect(s.preview()).toBeNull()
  expect(s.cards.every(card => !card.hasAttribute('style') && !card.hasAttribute('aria-grabbed'))).toBe(true)
  expect(s.board.hasAttribute('data-card-reordering')).toBe(false)
  expect(s.frames.size).toBe(0)
})

it('autoscrolls both axes and stops on exit', async () => {
  const s = await setup()
  s.start()
  s.dispatch(s.board, 'dragover', 790, 590)
  s.frame()
  expect(s.board.scrollLeft).toBeGreaterThan(0)
  expect(s.board.scrollTop).toBeGreaterThan(0)
  s.dispatch(s.board, 'dragleave', 810, 610)
  const scroll = [s.board.scrollLeft, s.board.scrollTop]
  s.frame()
  expect([s.board.scrollLeft, s.board.scrollTop]).toEqual(scroll)
  expect(s.frames.size).toBe(0)
})

it('ignores foreign drops without an active card drag', async () => {
  const s = await setup()
  s.dispatch(s.board, 'drop', 400, 200)
  expect(s.move).not.toHaveBeenCalled()
  expect(s.preview()).toBeNull()
})
