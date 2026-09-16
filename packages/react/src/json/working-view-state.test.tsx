// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { JSONContent } from './json-content.js'
import type { JsonViewsPresentationState } from '../viewer-state.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); vi.restoreAllMocks() })

it('restores automatic view previews before their debounced save without writing on restore', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  const content = JSON.stringify({ rows: [{ name: 'Ada', status: 'New' }], $jsonviews: { version: 1, views: [{ id: 'board', name: 'Board', path: '$.rows', display: 'kanban', groupBy: '$.rows[*].status' }] } })
  let cached: JsonViewsPresentationState | undefined
  const save = vi.fn(async () => {})
  rendered = await renderComponent(<JSONContent content={content} onSave={save} onPresentationStateChange={(state) => { cached = state }} />)
  const click = async (selector: string) => {
    const control = document.querySelector<HTMLElement>(selector)
    expect(control).not.toBeNull()
    await act(async () => { control!.click() })
  }
  await click('[data-id="jsonView-edit-view"]')
  await click('[data-id="jsonView-layout-table"]')
  expect(rendered.container.querySelector('[data-id="jsonView-kanban-layout"]')).toBeNull()
  expect(cached?.viewDrafts).toBeDefined()
  await rendered.cleanup()
  rendered = await renderComponent(<JSONContent content={content} onSave={save} presentationState={cached} />)
  expect(rendered.container.querySelector('[data-id="jsonView-kanban-layout"]')).toBeNull()
  expect(rendered.container.querySelector('thead')?.textContent).toContain('name')
  expect(save).not.toHaveBeenCalled()
  await click('[data-id="tabular-column-menu"]')
  await click('[data-id="tabular-hide-column"]')
  expect(save).toHaveBeenCalledTimes(1)
  expect(rendered.container.querySelector('thead')?.textContent).not.toContain('name')
  expect(rendered.container.querySelector('thead')?.textContent).toContain('status')
})
