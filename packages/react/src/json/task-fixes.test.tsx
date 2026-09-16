// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { JSONContent } from './json-content.js'
import { coversAllDocumentData } from './source-selection.js'
let rendered: RenderResult | undefined
const click = async (element: Element | null) => {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control')
  await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); element.click() })
}
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks() })
it.each([false, true])('opens a root-array record with cached view draft: %s', async (cached) => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  const content = JSON.stringify([{ id: 'person-1', name: 'Ada', email: 'ada@example.com', about: 'Biography', experience: [{ company: 'Example' }] }, { id: 'person-2', name: 'Grace', email: 'grace@example.com', about: 'Biography', experience: [] }, { id: 'person-3', name: 'Katherine', email: 'katherine@example.com', about: 'Biography', experience: [] }])
  rendered = await renderComponent(<JSONContent content={content} presentationState={cached ? { version: 1, viewDrafts: { '["root","$"]': { id: 'data', name: 'Data', path: '$' } } } : undefined} onSave={async () => {}} />)
  await click(rendered.container.querySelector('[aria-label="Open Ada"]'))
  expect(rendered.container.querySelector('[data-id="jsonView-record-view"]')).not.toBeNull()
})
it('recognizes full data coverage while ignoring root metadata', () => {
  const root = { tasks: [{ name: 'A' }, { name: 'B' }], $jsonviews: { version: 1 } }
  expect(coversAllDocumentData(root, [['tasks']])).toBe(true)
  expect(coversAllDocumentData(root, [['tasks', 0], ['tasks', 1]])).toBe(true)
  expect(coversAllDocumentData(root, [['tasks', 0]])).toBe(false)
  expect(coversAllDocumentData({ ...root, other: [] }, [['tasks']])).toBe(false)
  expect(coversAllDocumentData(root, [])).toBe(false)
})
it.each([undefined, ['Stage 10', 'Stage 1']])('sorts default lanes while honoring explicit order %j', async (groupOrder) => {
  const rows = [{ name: 'A', status: 'Stage 10' }, { name: 'B', status: 'Stage 2' }, { name: 'C', status: 'Stage 1' }]
  const content = JSON.stringify({ rows, $jsonviews: { version: 1, views: [{ name: 'Board', path: '$.rows', display: 'kanban', groupBy: '$.rows[*].status', groupOrder }] } })
  rendered = await renderComponent(<JSONContent content={content} />)
  const order = Array.from(rendered.container.querySelectorAll('[data-id="jsonView-kanban-column"]')).map(el => el.getAttribute('data-group-value'))
  expect(order).toEqual(groupOrder ? ['Stage 10', 'Stage 1', 'Stage 2'] : ['Stage 1', 'Stage 2', 'Stage 10'])
})
it('formats generated additions and hides the formatter once source is formatted', async () => {
  const save = vi.fn(async (_source: string) => {})
  rendered = await renderComponent(<JSONContent content='{"rows":[{"name":"A"}],"exact":9007199254740993,"$jsonviews":{"version":1,"views":[{"id":"rows","name":"Rows","path":"$.rows"}]}}' onSave={save} />)
  await click(rendered.container.querySelector('[data-id="jsonView-json-tab-source"]'))
  expect(rendered.container.querySelector('[aria-label="Format JSON"]')).not.toBeNull()
  await click(rendered.container.querySelector('[data-id="jsonView-json-tab-rows"]'))
  await click(rendered.container.querySelector('[data-id="tabular-add-row"]'))
  expect(save.mock.calls.at(-1)?.[0]).toContain('\n  "exact": 9007199254740993')
  expect(JSON.parse(save.mock.calls.at(-1)![0]).rows).toHaveLength(2)
  await click(rendered.container.querySelector('[data-id="jsonView-json-tab-source"]'))
  expect(rendered.container.querySelector('[aria-label="Format JSON"]')).toBeNull()
})

it('offers manual formatting only for unformatted valid source', async () => {
  rendered = await renderComponent(<JSONContent content='{ "name":"A" }' onSave={async () => {}} />)
  await click(rendered.container.querySelector('[data-id="jsonView-json-tab-source"]'))
  await click(rendered.container.querySelector('[aria-label="Format JSON"]'))
  expect(rendered.container.querySelector('[aria-label="Format JSON"]')).toBeNull()
})
it('accepts pretty-printed JSON with a trailing newline as formatted', async () => {
  rendered = await renderComponent(<JSONContent content={'{\n  "name": "A"\n}\n'} onSave={async () => {}} />)
  await click(rendered.container.querySelector('[data-id="jsonView-json-tab-source"]'))
  expect(rendered.container.querySelector('[aria-label="Format JSON"]')).toBeNull()
})
