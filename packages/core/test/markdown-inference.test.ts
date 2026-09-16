import { expect, it } from 'vitest'
import { inferJsonViewMetadata } from '../src/inference.js'
import { compileJsonViewMetadata } from '../src/metadata.js'
import { isMarkdownText } from '../src/inference-fields.js'

it.each(['# Heading', '**bold**', '*italic*', '_italic_', '`code`', '~~removed~~', '- item', '1. item', '> quote', '[label](./page)', '<strong>HTML</strong>', '<br>', 'Title\n---', '| --- | --- |'])('recognizes formatting: %s', value => {
  expect(isMarkdownText(value)).toBe(true)
  const schema = inferJsonViewMetadata([{ name: 'One', notes: value }, { name: 'Two', notes: 'Plain text' }, { name: 'Three', notes: '' }]).schema
  expect(schema['$[*].notes']?.type).toBe('markdown')
})

it.each(['#hashtag', 'user_name_v2', 'a < b && c > d', 'first\nsecond', 'x'.repeat(200), 'price * quantity'])('keeps ambiguous plain text literal: %s', value => {
  expect(isMarkdownText(value)).toBe(false)
})

it('lets an explicit text schema override formatted values', () => {
  const compiled = compileJsonViewMetadata({ rows: [{ notes: '**literal**' }], $jsonviews: { version: 1, schema: { '$.rows[*].notes': { type: 'text' } } } })
  expect(compiled.schema.find(entry => entry.declaration === '$.rows[*].notes')?.descriptor.type).toBe('text')
})
