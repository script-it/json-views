import { describe, expect, it } from 'vitest'

import { getValueAtPath, valuePathKey, VALUE_PATH_MISSING } from '../src/json-path'

describe('typed JSON paths', () => {
  it('resolves falsy roots and dotted object keys', () => {
    expect(getValueAtPath(false, [])).toBe(false)
    expect(getValueAtPath({ 'a.b': 0 }, ['a.b'])).toBe(0)
  })

  it('keeps numeric object keys distinct from array indices', () => {
    expect(getValueAtPath({ '0': 'object' }, ['0'])).toBe('object')
    expect(getValueAtPath(['array'], [0])).toBe('array')
    expect(getValueAtPath({ '0': 'object' }, [0])).toBe(VALUE_PATH_MISSING)
    expect(getValueAtPath(['array'], ['0'])).toBe(VALUE_PATH_MISSING)
  })

  it('rejects missing and sparse array entries', () => {
    const sparse = new Array<unknown>(2)
    sparse[1] = 'present'
    expect(getValueAtPath(sparse, [0])).toBe(VALUE_PATH_MISSING)
    expect(getValueAtPath(sparse, [1])).toBe('present')
  })

  it('resolves own prototype-sensitive keys without inherited properties', () => {
    const value = JSON.parse('{"__proto__":"own"}') as unknown
    expect(getValueAtPath(value, ['__proto__'])).toBe('own')
    expect(getValueAtPath({}, ['toString'])).toBe(VALUE_PATH_MISSING)
  })

  it('uses a collision-free state key', () => {
    expect(valuePathKey(['a.b'])).not.toBe(valuePathKey(['a', 'b']))
    expect(valuePathKey(['0'])).not.toBe(valuePathKey([0]))
  })
})
