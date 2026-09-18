import { describe, expect, it } from 'vitest'

import { getDictOfObjectsInfo } from './json-flatten.js'

describe('getDictOfObjectsInfo', () => {
  it('flattens a map of similarly-shaped records into rows and columns', () => {
    const info = getDictOfObjectsInfo({
      'document workflow automation': { keyword: 'document workflow automation', slug: 'doc-wf', rank: 268 },
      'invoice processing': { keyword: 'invoice processing', slug: 'invoice', rank: 12 },
      'data entry': { keyword: 'data entry', slug: 'data', rank: 45 },
    })

    expect(info).not.toBeNull()
    expect(info!.keyColumn).toBe('key')
    // Key column leads; nested fields follow in first-seen order.
    expect(info!.columns).toEqual(['key', 'keyword', 'slug', 'rank'])
    expect(info!.keys).toEqual(['document workflow automation', 'invoice processing', 'data entry'])
    expect(info!.records[0]).toEqual({
      key: 'document workflow automation',
      keyword: 'document workflow automation',
      slug: 'doc-wf',
      rank: 268,
    })
  })

  it('rejects sparse records whose shared fields are a minority of columns', () => {
    expect(getDictOfObjectsInfo({
      a: { shared: 1, only_a: 2 },
      b: { shared: 3, only_b: 4 },
      c: { shared: 5, only_c: 6 },
    })).toBeNull()
  })

  it('renames the key column when a nested field is already named "key"', () => {
    const info = getDictOfObjectsInfo({
      a: { key: 'inner-a', value: 1 },
      b: { key: 'inner-b', value: 2 },
      c: { key: 'inner-c', value: 3 },
    })

    expect(info!.keyColumn).toBe('_key')
    expect(info!.columns).toEqual(['_key', 'key', 'value'])
    // The map key lands in the reserved column; the real `key` field is intact.
    expect(info!.records[0]).toEqual({ _key: 'a', key: 'inner-a', value: 1 })
  })

  it('returns null for fewer than two entries', () => {
    expect(getDictOfObjectsInfo({ only: { a: 1 } })).toBeNull()
  })

  it('returns null when any value is not a plain object', () => {
    expect(getDictOfObjectsInfo({ a: { x: 1 }, b: 2 })).toBeNull()
    expect(getDictOfObjectsInfo({ a: { x: 1 }, b: [1, 2] })).toBeNull()
    expect(getDictOfObjectsInfo({ a: { x: 1 }, b: null })).toBeNull()
  })

  it('rejects dissimilar records with no shared field', () => {
    // A config of unrelated sections is a map, not a collection — leave it as
    // the key/value view rather than forcing a sparse table.
    expect(
      getDictOfObjectsInfo({
        database: { host: 'db', port: 5432 },
        cache: { ttl: 60, size: 100 },
      }),
    ).toBeNull()
  })

  it('returns null when every record is empty', () => {
    expect(getDictOfObjectsInfo({ a: {}, b: {} })).toBeNull()
  })
})
