// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { compileJsonViewMetadata } from '@script-it/json-views-core'
import { renderComponent, type RenderResult } from '../test/render.js'
import { RecordView } from './record-view.js'
import { nestedRecordView } from './view-model.js'
import { isLongText } from './long-text.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined })

it('uses layout heuristics only for text', () => {
  expect(isLongText('a'.repeat(121))).toBe(true)
  expect(isLongText('first\nsecond')).toBe(true)
  expect(isLongText('', { type: 'text', multiline: true })).toBe(true)
  expect(isLongText('short')).toBe(false)
  expect(isLongText('https://example.com/' + 'x'.repeat(150), { type: 'url' })).toBe(false)
})

it('renders multiple read-only Markdown properties automatically without changing their source', async () => {
  const root = { name: 'Example', one: '# One\n**first**', status: 'Ready', longPlain: 'Long plain text. '.repeat(12), multiline: 'First line\nSecond line', two: '# Two\n<strong>second</strong>', summary: 'Plain text' }
  const document = { records: [root], $jsonviews: { version: 1, schema: { '$.records[*].one': { type: 'markdown' }, '$.records[*].two': { type: 'markdown' } } } }
  const compiled = compileJsonViewMetadata(document)
  const markdown = vi.fn((text: string) => <p data-preview>{text}</p>)
  rendered = await renderComponent(<RecordView compiled={compiled} {...nestedRecordView(document, ['records', 0], 'name', 'Record')!} copyFileName="demo.json" fillHeight={false} renderMarkdown={markdown} />)
  expect(rendered.container.querySelector('[data-id="json-markdown-toggle"]')).toBeNull()
  expect(rendered.container.querySelector('[aria-label^="Type for"]')).toBeNull()
  expect(Array.from(rendered.container.querySelectorAll('dt')).map(node => node.textContent?.trim())).toEqual(['status', 'summary', 'one', 'longPlain', 'multiline', 'two'])
  expect(rendered.container.querySelectorAll('[data-preview]')).toHaveLength(2)
  expect(root.one).toBe('# One\n**first**')
  expect(rendered.container.querySelector('textarea')).toBeNull()
})

it('shows the current nested path with one back action', async () => {
  const { JSONContent } = await import('./json-content.js')
  const { act } = await import('react')
  rendered = await renderComponent(<JSONContent sourceVisible={false} content={JSON.stringify({ count: 1, details: { enabled: true, more: { ready: true } } })} />)
  expect(rendered.container.querySelector('[data-id="jsonView-record-title"]')).toBeNull()
  const open = rendered.container.querySelector<HTMLElement>('[aria-label="Open nested value"]')
  expect(open).not.toBeNull()
  await act(async () => { open!.click() })
  expect(rendered.container.querySelector('[data-id="jsonView-record-title"]')).toBeNull()
  expect(rendered.container.textContent).toContain('Enabled')
  expect(rendered.container.querySelector('[data-id="jsonView-breadcrumb-path"]')?.textContent).toBe('details')
  expect(rendered.container.querySelectorAll('nav[aria-label="Breadcrumb"] button')).toHaveLength(1)
  const back = rendered.container.querySelector<HTMLElement>('nav[aria-label="Breadcrumb"] button')
  await act(async () => { back!.click() })
  expect(rendered.container.querySelector('[data-id="jsonView-record-title"]')).toBeNull()
})

it('keeps a dictionary of records as a collection table', async () => {
  const { JSONContent } = await import('./json-content.js')
  rendered = await renderComponent(<JSONContent content={JSON.stringify({ first: { name: 'A', score: 1 }, second: { name: 'B', score: 2 }, third: { name: 'C', score: 3 } })} />)
  expect(rendered.container.querySelector('[data-id="jsonView-record-view"]')).toBeNull()
  expect(rendered.container.querySelector('table')).not.toBeNull()
})

it('shows a sole object in an inferred array as a record, while a declared table stays tabular', async () => {
  const { JSONContent } = await import('./json-content.js')
  const value = [{ name: 'Result', score: 42 }]
  rendered = await renderComponent(<JSONContent sourceVisible={false} content={JSON.stringify(value)} />)
  expect(rendered.container.querySelector('[data-id="jsonView-record-title"]')?.textContent).toBe('Result')
  expect(rendered.container.querySelector('table')).toBeNull()
  await rendered.cleanup()
  rendered = await renderComponent(<JSONContent sourceVisible={false} content={JSON.stringify({ results: value, $jsonviews: { version: 1, views: [{ id: 'results', name: 'Results', path: '$.results' }] } })} />)
  expect(rendered.container.querySelector('table')).not.toBeNull()
})

it('shows inferred HTML in an isolated preview with source editing', async () => {
  const { JSONContent } = await import('./json-content.js')
  const page = '<!doctype html><html><head><style>body { color: red }</style></head><body><p>Hello</p></body></html>'
  rendered = await renderComponent(<JSONContent sourceVisible={false} content={JSON.stringify({ name: 'Page', output_html: page })} />)
  const preview = rendered.container.querySelector<HTMLIFrameElement>('[data-id="jsonView-html-preview"]')
  expect(preview?.getAttribute('sandbox')).toBe('')
  expect(preview?.getAttribute('srcdoc')).toContain('<style>body { color: red }</style>')
  expect(preview?.getAttribute('srcdoc')).toContain('Content-Security-Policy')
  expect(preview?.getAttribute('title')).toContain('HTML preview')
})
