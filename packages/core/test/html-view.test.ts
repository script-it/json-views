import { expect, it } from 'vitest'
import { compileJsonViewMetadata, htmlRepeatKeys, resolveHtmlViewBinding, JSON_VIEW_PATH_MISSING } from '../src/index.js'
const view = { name: 'Custom', path: '$', display: 'html', html: '<h1><jv-field bind="$.name"></jv-field></h1>' }
it('compiles HTML alongside built-in views and validates incompatible settings', () => {
  const compile = (extra = {}) => compileJsonViewMetadata({ name: 'Hello', $jsonviews: { version: 1, views: [{ ...view, ...extra }] } })
  expect(compile().views[0]).toMatchObject({ display: 'html', css: '' })
  expect(compile().diagnostics).toEqual([])
  for (const extra of [{ html: '' }, { css: 2 }, { columns: [] }, { sort: [] }, { html: 'x'.repeat(262145) }]) expect(compile(extra).views).toEqual([])
})
it('resolves aliases, rejects wildcard/inherited aliases, scope escapes and metadata writes', () => {
  const root = { rows: [{ 'odd.key': 'hello', done: false }], $jsonviews: {} }
  expect(resolveHtmlViewBinding(root, "row['odd.key']", { row: ['rows', 0] }, ['rows']).value).toBe('hello')
  expect(resolveHtmlViewBinding(root, 'row.missing', { row: ['rows', 0] }, ['rows']).value).toBe(JSON_VIEW_PATH_MISSING)
  for (const expression of ['$.rows[*].done', '$.$jsonviews', '$.outside', 'toString.name']) expect(() => resolveHtmlViewBinding(root, expression, {}, ['rows'])).toThrow()
})
it('uses typed unique record identities without adding IDs', () => {
  expect(htmlRepeatKeys([{ id: 1 }, { id: '1' }], 'id')).toEqual(['number:1', 'string:1'])
  expect(() => htmlRepeatKeys([{ id: 1 }, { id: 1 }], 'id')).toThrow('unique')
  expect(() => htmlRepeatKeys([{}], 'id')).toThrow('every item')
})
