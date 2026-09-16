import { describe, expect, it } from 'vitest'
import { convertToJsonViewsDocument } from '../src/formats/conversion.js'

describe('convertToJsonViewsDocument', () => {
  it('leaves filter comparison values and custom extension payloads untouched', () => {
    const literal = { path: '$.literal', title: '$.literal' }
    const metadata = { version: 1, extension: literal, schema: { '$[*].item': { type: 'custom', config: literal } }, views: [{
      name: 'View', path: '$', extension: literal,
      filter: { rules: [{ path: '$[*].item', operator: 'eq', value: literal }] },
    }] }
    const converted = JSON.parse(convertToJsonViewsDocument({ root: [], sourceFormat: 'json-array', metadata }))
    expect(converted.$jsonviews.extension).toEqual(literal)
    expect(converted.$jsonviews.views[0].extension).toEqual(literal)
    expect(converted.$jsonviews.views[0].filter.rules[0]).toMatchObject({ path: '$.data[*].item', value: literal })
    expect(converted.$jsonviews.schema['$.data[*].item'].config).toEqual(literal)
  })

  it('preserves authoritative object source and refuses invalid source or version downgrades', () => {
    const source = '{ "id":9007199254740993, "value":-0, "duplicate":1,"duplicate":2 }\n'
    const converted = convertToJsonViewsDocument({ root: {}, source, sourceFormat: 'json-object' })
    expect(converted).toContain('"id":9007199254740993, "value":-0, "duplicate":1,"duplicate":2')
    expect(() => convertToJsonViewsDocument({ root: [], source: '{', sourceFormat: 'json-array' })).toThrow()
    expect(() => convertToJsonViewsDocument({ root: [], source: '{}', sourceFormat: 'json-array' })).toThrow(/array/)
    expect(() => convertToJsonViewsDocument({ root: [], metadata: { version: 2 }, sourceFormat: 'json-array' })).toThrow(/version/)
  })
  it('wraps array data and rebases every recognized annotation path', () => {
    const converted = JSON.parse(convertToJsonViewsDocument({
      root: [{ status: 'new', rank: 1 }],
      sourceFormat: 'json-array',
      metadata: {
        version: 1,
        schema: { '$[*].status': { type: 'select' } },
        views: [{
          id: 'all', name: 'All', path: '$', groupBy: '$[*].status', orderPath: '$[*].rank',
          columns: [{ label: 'Status', path: '$[*].status' }],
          filter: { match: 'all', rules: [{ path: '$[*].status', operator: 'eq', value: 'new' }] },
          sort: [{ path: '$[*].rank', direction: 'asc' }],
        }],
      },
    }))
    expect(converted.data).toEqual([{ status: 'new', rank: 1 }])
    expect(converted.$jsonviews.schema).toHaveProperty('$.data[*].status')
    expect(converted.$jsonviews.views[0]).toMatchObject({ path: '$.data', groupBy: '$.data[*].status', orderPath: '$.data[*].rank' })
    expect(converted.$jsonviews.views[0].columns[0].path).toBe('$.data[*].status')
    expect(converted.$jsonviews.views[0].filter.rules[0].path).toBe('$.data[*].status')
    expect(converted.$jsonviews.views[0].sort[0].path).toBe('$.data[*].rank')
  })

  it('emits the canonical empty metadata shape', () => {
    expect(JSON.parse(convertToJsonViewsDocument({ root: [], sourceFormat: 'csv' }))).toEqual({
      $jsonviews: { version: 1, schema: {}, views: [] }, data: [],
    })
  })
})
