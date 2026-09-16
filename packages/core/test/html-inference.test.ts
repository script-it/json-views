import { expect, it } from 'vitest'
import { compileJsonViewMetadata } from '../src/metadata.js'
import { inferJsonViewMetadata } from '../src/inference.js'
import { isHtmlDocument } from '../src/inference-fields.js'

const page = '<!doctype html><html><head><style>body { color: red }</style></head><body><div>Hello</div></body></html>'

it('infers complete and styled HTML as HTML, while simple fragments remain Markdown', () => {
  expect(isHtmlDocument(page)).toBe(true)
  expect(isHtmlDocument('<style>.card { color: red }</style><div class="card">Hi</div>')).toBe(true)
  expect(isHtmlDocument('<strong>Hello</strong>')).toBe(false)
  expect(inferJsonViewMetadata([{ output_html: page }]).schema['$[*].output_html']?.type).toBe('html')
  expect(inferJsonViewMetadata([{ output_html: '<strong>Hello</strong>' }]).schema['$[*].output_html']?.type).toBe('markdown')
})

it('keeps an explicit text declaration for an HTML value', () => {
  const root = { rows: [{ output_html: page }], $jsonviews: { version: 1, schema: { '$.rows[*].output_html': { type: 'text' } } } }
  expect(compileJsonViewMetadata(root).schema.find(entry => entry.declaration === '$.rows[*].output_html')?.descriptor.type).toBe('text')
})
