// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { CSVContent, JSONContent } from './json-content.js'

let rendered: RenderResult | undefined
beforeEach(() => { vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600) })
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks() })

const rows = [{ name: 'Ada', score: 1 }, { name: 'Grace', score: 2 }, { name: 'Katherine', score: 3 }]
const content = JSON.stringify({ people: rows })
const active = (id: string) => rendered!.container.querySelector(`[data-id="jsonView-json-tab-${id}"]`)?.getAttribute('data-state')
async function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control')
  await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); element.click() })
}

describe('strict predicted views', () => {
  it('offers Root and Source and respects a saved Root choice for compact nested data', async () => {
    const nested = JSON.stringify({ envelope: { body: { action: 'opened', id: 4, author: 'Ada' } } })
    rendered = await renderComponent(<JSONContent content={nested} />)
    expect(active('source')).toBe('active')
    await click(rendered.container.querySelector('[data-id="jsonView-json-tab-root"]'))
    expect(active('root')).toBe('active')
    await rendered.cleanup()
    rendered = await renderComponent(<JSONContent content={nested} presentationState={{ version: 1, activeView: 'root' }} />)
    expect(active('root')).toBe('active')
  })

  it('flattens consistent object fields into labeled columns without changing row count', async () => {
    const people = Array.from({ length: 4 }, (_, i) => ({ name: `Person ${i}`, company: { name: `Company ${i}`, country: 'UK' } }))
    rendered = await renderComponent(<JSONContent content={JSON.stringify(people)} />)
    const headers = [...rendered.container.querySelectorAll('th')].map((node) => node.textContent)
    expect(headers).toContain('company · name')
    expect(headers).toContain('company · country')
    expect(rendered.container.textContent).toContain('4 rows')
  })

  it('keeps structured view settings available while Source stays selected', async () => {
    const document = { people: rows, $jsonviews: { version: 1, views: [{ id: 'people', name: 'People', path: '$.people' }] } }
    rendered = await renderComponent(<JSONContent content={JSON.stringify(document)} onSave={async () => {}} />)
    await click(rendered.container.querySelector('[data-id="jsonView-json-tab-source"]'))
    const settings = rendered.container.querySelector<HTMLButtonElement>('[data-id="jsonView-edit-view"]')
    expect(settings?.disabled).toBe(false)
    await click(settings)
    expect(active('source')).toBe('active')
    expect(globalThis.document.body.textContent).toContain('Properties')
    expect(rendered.container.querySelector('[data-id="jsonView-source-view"]')).not.toBeNull()
  })

  it('opens the leftmost predicted view and remembers an explicit selection', async () => {
    rendered = await renderComponent(<JSONContent content={content} />)
    expect(active('root')).toBe('inactive')
    expect(active('people')).toBe('active')
    await click(rendered.container.querySelector('[data-id="jsonView-json-tab-people"]'))
    expect(active('people')).toBe('active')
    await act(async () => { rendered!.root.render(<TooltipProvider><JSONContent content={JSON.stringify({ people: [...rows, { name: 'Dorothy', score: 4 }] })} /></TooltipProvider>) })
    expect(active('people')).toBe('active')
  })

  it('restores a saved predicted tab and falls back to the leftmost view for a removed prediction', async () => {
    const saved = { version: 1 as const, activeView: 'view:people' }
    rendered = await renderComponent(<JSONContent content={content} presentationState={saved} />)
    expect(active('people')).toBe('active')
    await rendered.cleanup()
    rendered = await renderComponent(<JSONContent content={content} presentationState={{ ...saved, activeView: 'view:removed' }} />)
    expect(active('people')).toBe('active')
  })

  it('preserves explicit views for a collection that would fail prediction', async () => {
    rendered = await renderComponent(<JSONContent content='{"items":[{"name":"One"}],"$jsonviews":{"version":1,"views":[{"id":"chosen","name":"Chosen","path":"$.items"}]}}' />)
    expect(active('chosen')).toBe('active')
    expect(rendered.container.querySelector('[data-id="tabular-data-frame"]')).not.toBeNull()
  })

  it.each(['root', 'nested'])('uses union columns for heterogeneous blocks at %s', async (location) => {
    const blocks = [
      { object: 'block', type: 'heading', heading: { text: 'Title' } },
      { object: 'block', type: 'paragraph', paragraph: { text: 'Content' } },
      { object: 'block', type: 'divider', divider: {} },
    ]
    rendered = await renderComponent(<JSONContent content={JSON.stringify(location === 'root' ? blocks : { children: blocks })} />)
    expect(rendered.container.querySelectorAll('[data-id="jsonView-json-tabs"] [role="tab"]')).toHaveLength(location === 'root' ? 2 : 3)
    await click(rendered.container.querySelector('[data-id="jsonView-json-tab-root"]'))
    if (location === 'nested') await click(rendered.container.querySelector('[aria-label="Open nested value"]'))
    const headers = [...rendered.container.querySelectorAll('th')].map((header) => header.textContent)
    expect(headers).not.toContain('Value')
    expect(headers).toContain('object')
    expect(headers).toContain('type')
    expect(headers).toContain('heading')
  })

  it('renders two records with tags and missing fields as a table', async () => {
    rendered = await renderComponent(<JSONContent content={JSON.stringify({ people: [
      { name: 'Ada', tags: ['engineering'] }, { name: 'Grace', tags: ['design'], extra: true },
    ] })} />)
    await click(rendered.container.querySelector('[data-id="jsonView-json-tab-people"]'))
    const headers = [...rendered.container.querySelectorAll('th')].map((header) => header.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Name', 'Tags', 'Extra']))
    expect(rendered.container.textContent).toContain('2 rows')
    expect(rendered.container.textContent).toContain('engineering')
    expect(rendered.container.textContent).toContain('design')
  })

  it('keeps even a one-row CSV tabular', async () => {
    rendered = await renderComponent(<CSVContent content={'name,score\nAda,1\n'} />)
    expect(rendered.container.querySelector('[data-id="jsonView-search-button"]')).not.toBeNull()
    expect(rendered.container.textContent).toContain('Ada')
  })
})
