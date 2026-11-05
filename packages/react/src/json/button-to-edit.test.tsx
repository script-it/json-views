// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { JSONContent } from './json-content.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); vi.restoreAllMocks() })

it.each([true, false])('supports buttonToEdit=%s for Markdown records', async (buttonToEdit) => {
  const onSave = vi.fn(async () => {})
  rendered = await renderComponent(<JSONContent buttonToEdit={buttonToEdit} sourceVisible={false}
    content={JSON.stringify({ title: 'Page', notes: '# Notes\nSome **text**', $jsonviews: { version: 1, schema: { '$.notes': { type: 'markdown' } }, views: [{ id: 'page', name: 'Page', path: '$', display: 'record' }] } })}
    onSave={onSave} renderMarkdown={() => <p data-preview><strong>Notes</strong><a href="#evidence">Evidence</a></p>} />)
  const preview = rendered.container.querySelector<HTMLElement>('[data-preview]')!
  expect(preview).not.toBeNull()
  await act(async () => { preview.querySelector('a')!.click() })
  expect(rendered.container.querySelector('textarea')).toBeNull()
  await act(async () => { preview.querySelector('strong')!.click() })
  if (buttonToEdit) {
    expect(rendered.container.querySelector('textarea')).toBeNull()
    const pencil = preview.closest('[data-id="structured-value-cell"]')!.querySelector<HTMLButtonElement>('button[data-id="structured-edit-value"]')!
    expect(pencil).not.toBeNull()
    await act(async () => { pencil.focus(); pencil.click() })
  }
  expect(rendered.container.querySelector('textarea')?.value).toBe('# Notes\nSome **text**')
  expect(onSave).not.toHaveBeenCalled()
})

it('opens a Markdown table editor only from the pencil when enabled', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 600, height: 600, left: 0, right: 800, top: 0, width: 800, x: 0, y: 0, toJSON: () => ({}) })
  rendered = await renderComponent(<JSONContent buttonToEdit sourceVisible={false}
    content={JSON.stringify({ rows: [{ name: 'First', notes: '# Notes' }, { name: 'Second', notes: '' }], $jsonviews: { version: 1, schema: { '$.rows[*].notes': { type: 'markdown' } }, views: [{ id: 'rows', name: 'Rows', path: '$.rows' }] } })}
    onSave={async () => {}} renderMarkdown={() => <p data-preview>Notes</p>} />)
  const preview = rendered.container.querySelector<HTMLElement>('tbody [data-preview]')!
  expect(preview).not.toBeNull()
  await act(async () => { preview.click() })
  expect(rendered.container.querySelector('[data-id="jsonView-record-view"]')).toBeNull()
  const pencil = preview.closest('td')!.querySelector<HTMLButtonElement>('[data-id="structured-edit-value"]')!
  await act(async () => { pencil.click() })
  expect(rendered.container.querySelector('textarea')?.value).toBe('# Notes')
})
