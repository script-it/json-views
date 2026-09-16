import { describe, it, expect } from 'vitest'
import { prefersSource } from './source-default.js'

describe('source default', () => {
  const payload = { headers: { event: 'pull_request' }, body: { action: 'opened', pull_request: { number: 3, title: 'Fix', user: { login: 'author' } } } }
  it('keeps renderable dictionaries structured, independent of input formatting', () => {
    expect(prefersSource(JSON.stringify(payload))).toBe(false)
    expect(prefersSource(JSON.stringify(payload, null, 2))).toBe(false)
  })
  it('keeps explicit views, natural tables and long documents structured', () => {
    expect(prefersSource(JSON.stringify(payload), { version: 1, views: [] })).toBe(false)
    expect(prefersSource(JSON.stringify([{ name: 'A', count: 1 }, { name: 'B', count: 2 }, { name: 'C', count: 3 }]))).toBe(false)
    expect(prefersSource(JSON.stringify({ ...payload, text: 'x'.repeat(9000) }))).toBe(false)
  })
})
