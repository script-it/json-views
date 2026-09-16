// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { JSONContent } from './json-content.js'

// jsdom has no viewport; render every virtual row while retaining real row keys.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 36, end: (index + 1) * 36 })),
    getTotalSize: () => count * 36,
    measure: () => {},
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}))

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined })

async function editScore() {
  await act(async () => {
    rendered!.container.querySelector<HTMLElement>('[aria-label="Edit score"]')!.click()
  })
  const input = rendered!.container.querySelector<HTMLInputElement>('input[aria-label="Edit score"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '9')
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  return input
}

async function saveScore(input: HTMLInputElement) {
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
}

for (const typed of [true, false]) {
  const metadata = {
    version: 1,
    schema: typed ? { '$.rows[*].score': { type: 'number', title: 'score' } } : {},
    views: [{ name: 'First', path: '$.rows[0]' }],
  }
  const rows = [{ name: 'Ada', score: 1 }, { name: 'Bob', score: 1 }]

  it(`preserves a ${typed ? 'typed' : 'plain'} cell draft instead of saving to a reordered record`, async () => {
    const save = vi.fn(async () => {})
    rendered = await renderComponent(<JSONContent documentId="same" content={JSON.stringify({ rows })} metadata={metadata} onSave={save} />)
    const input = await editScore()
    await act(async () => {
      rendered!.root.render(<TooltipProvider><JSONContent documentId="same" content={JSON.stringify({ rows: [...rows].reverse() })} metadata={metadata} onSave={save} /></TooltipProvider>)
    })
    await saveScore(input)
    expect(save).not.toHaveBeenCalled()
    expect(input.value).toBe('9')
    expect(rendered.container.textContent).toContain('changed outside this editor')
  })

  it(`allows retrying a failed ${typed ? 'typed' : 'plain'} cell save`, async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
    rendered = await renderComponent(<JSONContent documentId="same" content={JSON.stringify({ rows })} metadata={metadata} onSave={save} />)
    const input = await editScore()
    await saveScore(input)
    expect(rendered.container.textContent).toContain('Offline')
    await saveScore(input)
    expect(save).toHaveBeenCalledTimes(2)
    expect(JSON.parse(save.mock.calls[1]![0]).rows[0]).toEqual({ name: 'Ada', score: 9 })
    expect(rendered.container.textContent).not.toContain('Offline')
  })

  it(`keeps a failed ${typed ? 'typed' : 'plain'} editor on its record when sorting moves that record`, async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
    const tableMetadata = { ...metadata, views: [{
      id: 'scores', name: 'Scores', path: '$.rows',
      columns: [{ label: 'Name', path: '$.rows[*].name' }, { label: 'score', path: '$.rows[*].score' }],
      sort: [{ path: '$.rows[*].score', direction: 'asc' }],
    }] }
    rendered = await renderComponent(<JSONContent content={JSON.stringify({ rows: [{ name: 'Ada', score: 1 }, { name: 'Bob', score: 2 }] })} metadata={tableMetadata} onSave={save} />)
    const input = await editScore()
    await saveScore(input)
    expect(input.closest('tr')?.textContent).toContain('Ada')
    expect(input.closest('tr')?.textContent).not.toContain('Bob')
    await saveScore(input)
    expect(save).toHaveBeenCalledTimes(2)
    expect(JSON.parse(save.mock.calls[1]![0]).rows).toEqual([{ name: 'Ada', score: 9 }, { name: 'Bob', score: 2 }])
  })
}
