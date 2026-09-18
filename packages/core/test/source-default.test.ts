import { describe, expect, it } from 'vitest'
import { prefersSource } from '../src/source-default.js'

const prefers = (value: unknown) => prefersSource(JSON.stringify(value))

describe('compact nested source default', () => {
  it('opens unrelated dictionary sections in the property view', () => {
    expect(prefers({ database: { host: 'db' }, logging: { level: 'info' } })).toBe(false)
  })

  it('opens shallow objects and arrays with a small nested root in source', () => {
    expect(prefers({ status: 'ok', body: { message: 'Hello' } })).toBe(true)
    expect(prefers([{ message: 'Hello' }])).toBe(true)
  })

  it('requires a non-empty nested container', () => {
    for (const value of [null, 42, 'hello', {}, [], { status: 'ok' }, { a: {}, b: [] }, [1, 2]]) {
      expect(prefers(value)).toBe(false)
    }
  })

  it('keeps primitive array fields in table, regardless of input formatting', () => {
    for (const value of [
      { new_count: 1, new_user_ids: ['UfM9nivkKqTzjbwqvWf91uB7tln2'] },
      { tags: ['one', 'two'] },
      { values: ['hello', 42, true, false, null] },
      { values: [] },
    ]) {
      expect(prefers(value)).toBe(false)
      expect(prefersSource(JSON.stringify(value, null, 2))).toBe(false)
    }
  })

  it('still prefers source for an array containing a nested object without inferred views', () => {
    expect(prefers({ values: [{ message: 'Hello' }] })).toBe(true)
  })

  it('allows five root entries but not six', () => {
    const value = { a: 1, b: 2, c: 3, d: 4, body: { message: 'Hello' } }
    expect(prefers(value)).toBe(true)
    expect(prefers({ ...value, e: 5 })).toBe(false)
  })

  it('allows 3000 formatted characters but not 3001', () => {
    const value = { body: { text: '' } }
    const overhead = JSON.stringify(value, null, 2).length
    value.body.text = 'x'.repeat(3000 - overhead)
    expect(prefers(value)).toBe(true)
    value.body.text += 'x'
    expect(prefers(value)).toBe(false)
  })

  it('allows 40 formatted lines but not 41, regardless of input formatting', () => {
    const value = { body: Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`k${i}`, i])) }
    const formatted = JSON.stringify(value, null, 2)
    expect(formatted.split('\n')).toHaveLength(40)
    expect(prefersSource(formatted)).toBe(true)
    expect(prefers(value)).toBe(true)
    value.body.extra = 1
    expect(prefers(value)).toBe(false)
  })

  it('preserves the original deep nesting rule beyond the new short limits', () => {
    expect(prefers({ body: { nested: { text: 'x'.repeat(3100) } } })).toBe(true)
    expect(prefers({ body: { nested: { text: 'x'.repeat(8100) } } })).toBe(false)
  })

  it('preserves explicit metadata and natural table defaults', () => {
    const value = { body: { message: 'Hello' } }
    expect(prefersSource(JSON.stringify(value), { version: 1, views: [] })).toBe(false)
    expect(prefers({ ...value, $jsonviews: { version: 1, views: [] } })).toBe(false)
    expect(prefers([{ name: 'A', count: 1 }, { name: 'B', count: 2 }, { name: 'C', count: 3 }])).toBe(false)
    // Inferred views also retain their existing precedence.
    expect(prefers({ tags: ['one', 'two'] })).toBe(false)
    expect(prefersSource('{')).toBe(false)
  })
})
