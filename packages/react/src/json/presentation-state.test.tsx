// @vitest-environment jsdom
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { JSONContent } from './json-content.js'
import { TabularObjectArrayView } from '../tabular-data-view.js'
import { JsonViewsSurface } from '../surface.js'
import type { JsonViewsPresentationState } from '../viewer-state.js'

let rendered: RenderResult | undefined
afterEach(async () => {
  await rendered?.cleanup()
  rendered = undefined
  vi.restoreAllMocks()
})

const views = [{ id: 'first', name: 'First', path: '$.rows' }, { id: 'second', name: 'Second', path: '$.rows' }]
const content = JSON.stringify({ rows: [{ name: 'Alpha', score: 1 }, { name: 'Beta', score: 2 }], $jsonviews: { version: 1, views } })

async function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control')
  await act(async () => { element.click() })
}

function resizeHandle() {
  const handle = rendered!.container.querySelector('[aria-label^="Resize "]')
  if (!(handle instanceof HTMLElement)) throw new Error('Missing resize handle')
  return handle
}

describe('presentation persistence', () => {
  it('loads each document cache when an embedded host changes identity without a React key', async () => {
    const cacheA: JsonViewsPresentationState = { version: 1, activeView: 'view:second', queries: { 'view:second': 'Alpha' } }
    const cacheB: JsonViewsPresentationState = { version: 1, activeView: 'view:first', queries: { 'view:first': 'Beta' } }
    const changesB = vi.fn()
    rendered = await renderComponent(<JSONContent documentId="a" content={content} presentationState={cacheA} />)
    await act(async () => {
      rendered!.root.render(<TooltipProvider><JSONContent documentId="b" content={content} presentationState={cacheB} onPresentationStateChange={changesB} /></TooltipProvider>)
    })
    expect(rendered.container.querySelector('[data-id="jsonView-json-tab-first"]')?.getAttribute('data-state')).toBe('active')
    expect((rendered.container.querySelector('[aria-label="Search rows"]') as HTMLInputElement).value).toBe('Beta')
    expect(changesB.mock.calls.every(([state]) => !state.queries?.['view:second'])).toBe(true)
    await act(async () => {
      rendered!.root.render(<TooltipProvider><JSONContent documentId="a" content={content} presentationState={cacheA} /></TooltipProvider>)
    })
    expect(rendered.container.querySelector('[data-id="jsonView-json-tab-second"]')?.getAttribute('data-state')).toBe('active')
    expect((rendered.container.querySelector('[aria-label="Search rows"]') as HTMLInputElement).value).toBe('Alpha')
  })

  it('saves the final pointer width even when mouseup precedes the animation frame', async () => {
    let cached: JsonViewsPresentationState | undefined
    rendered = await renderComponent(<JSONContent documentId="pointer" content={content} onPresentationStateChange={(state) => { cached = state }} />)
    const handle = resizeHandle()
    vi.spyOn(handle.closest('th')!, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    await act(async () => {
      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, bubbles: true }))
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 320, bubbles: true }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    expect(handle.getAttribute('aria-valuenow')).toBe('320')
    expect(Object.values(cached?.tables ?? {}).flatMap((table) => Object.values(table.columnWidths ?? {}))).toContain(320)
  })

  it.each(['unmount', 'pagehide'])('flushes the latest scroll position on %s before the debounce expires', async (event) => {
    let cached: JsonViewsPresentationState | undefined
    rendered = await renderComponent(<JSONContent documentId="scroll" content={content} onPresentationStateChange={(state) => { cached = state }} />)
    const scroll = rendered.container.querySelector('[data-id="tabular-data-frame"] > div') as HTMLDivElement
    await act(async () => {
      scroll.scrollLeft = 130
      scroll.scrollTop = 450
      scroll.dispatchEvent(new Event('scroll', { bubbles: false }))
      if (event === 'pagehide') window.dispatchEvent(new Event('pagehide'))
    })
    if (event === 'unmount') {
      await rendered.cleanup()
      rendered = undefined
    }
    expect(Object.values(cached?.tables ?? {})).toContainEqual(expect.objectContaining({ scrollLeft: 130, scrollTop: 450 }))
  })

  it('keeps resized widths with their fields when declared columns are reordered', async () => {
    const columns = [{ label: 'Name', path: '$.rows[*].name' }, { label: 'Score', path: '$.rows[*].score' }]
    const source = (reversed: boolean) => JSON.stringify({ rows: [{ name: 'Alpha', score: 1 }], $jsonviews: { version: 1, views: [{ ...views[0], columns: reversed ? [...columns].reverse() : columns }] } })
    rendered = await renderComponent(<JSONContent documentId="reorder" content={source(false)} />)
    await act(async () => { resizeHandle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })) })
    await act(async () => { rendered!.root.render(<TooltipProvider><JSONContent documentId="reorder" content={source(true)} /></TooltipProvider>) })
    expect(rendered.container.querySelector('[aria-label="Resize Name column"]')?.getAttribute('aria-valuenow')).toBe('250')
    expect(rendered.container.querySelector('[aria-label="Resize Score column"]')?.getAttribute('aria-valuenow')).toBe('200')
  })

  it('does not overwrite another table cache when a reusable table switches keys', async () => {
    const cached: JsonViewsPresentationState = { version: 1, tables: {
      '["document","a"]': { collapsedColumns: ['d'], sort: { column: 'a', direction: 'asc' } },
      '["document","b"]': { collapsedColumns: ['c'], sort: { column: 'b', direction: 'desc' } },
    } }
    const changed = vi.fn()
    const table = (key: string) => <TooltipProvider><JsonViewsSurface presentationState={cached} onPresentationStateChange={changed}>
      <TabularObjectArrayView filePath="document" viewStateKey={key} arr={[{ a: 1, b: 2, c: 3, d: 4 }]} columns={['a', 'b', 'c', 'd']} onOpenCell={() => {}} />
    </JsonViewsSurface></TooltipProvider>
    rendered = await renderComponent(table('a'))
    await act(async () => { rendered!.root.render(<TooltipProvider>{table('b')}</TooltipProvider>) })
    expect(rendered.container.querySelector('[aria-label="Resize c column"]')).toBeNull()
    expect(rendered.container.querySelector('[aria-label="Resize d column"]')).not.toBeNull()
    expect(changed).not.toHaveBeenCalled()
  })

  it('restores immediate navigation after toggling source in a host that caches emitted state', async () => {
    function Host() {
      const [visible, setVisible] = useState(true)
      const [cache, setCache] = useState<JsonViewsPresentationState>()
      return <><button onClick={() => setVisible((value) => !value)}>Toggle source</button>
        {visible && <JSONContent documentId="navigation" content='{"profile":{"name":"Ada"}}' metadata={{ version: 1 }} presentationState={cache} onPresentationStateChange={setCache} />}
      </>
    }
    rendered = await renderComponent(<Host />)
    const term = Array.from(rendered.container.querySelectorAll('dt')).find((term) => term.textContent === 'profile')
    await click(term?.nextElementSibling?.querySelector('[aria-label="Open nested value"]'))
    await click(rendered.container.querySelector('button'))
    await click(rendered.container.querySelector('button'))
    expect(rendered.container.querySelector('[title="Back"]')).not.toBeNull()
    expect(rendered.container.textContent).toContain('Ada')
  })
})
