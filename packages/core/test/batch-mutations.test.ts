import { describe, expect, it } from 'vitest'
import { jsonArrayFormat, jsonObjectFormat, removeJsonValuesInSource, upsertJsonObjectPropertiesInSource } from '../src/index.js'

describe('source batch removal', () => {
  it('upserts a column without rebuilding rows or rounding their numbers', () => {
    const source = '[ {"id":9007199254740993}, {"id":1e+02}, {} ]'
    expect(upsertJsonObjectPropertiesInSource(source, [0, 1, 2].map((index) => ({ objectPath: [index], key: 'done', value: false }))))
      .toBe('[ {"id":9007199254740993, "done":false}, {"id":1e+02, "done":false}, {"done":false} ]')
    expect(upsertJsonObjectPropertiesInSource('{"a":1}', [{ objectPath: [], key: 'a', value: 2 }, { objectPath: [], key: '__proto__', value: 3 }]))
      .toBe('{"a":2, "__proto__":3}')
    expect(() => upsertJsonObjectPropertiesInSource('{"a":{}}', [{ objectPath: [], key: 'a', value: {} }, { objectPath: ['a'], key: 'nested', value: 1 }])).toThrow(/overlap/)
  })
  it('addresses original array indices in any order, including duplicates', () => {
    const source = '[0, 1, 2, 3, 4]'
    for (const paths of [[[0], [1], [4]], [[4], [0], [1], [0]]]) {
      expect(removeJsonValuesInSource(source, paths)).toBe('[2, 3]')
      expect(jsonArrayFormat.removeMany(source, { root: JSON.parse(source) }, paths)).toBe('[2, 3]')
    }
  })
  it('preserves exact surviving tokens, nested edits and surrounding bytes', () => {
    const source = ' { "a": [0, 1, 9007199254740993], "b": [2, 3], "c": 1e+02 }\n'
    expect(removeJsonValuesInSource(source, [['a', 0], ['a', 1], ['b', 1]]))
      .toBe(' { "a": [9007199254740993], "b": [2], "c": 1e+02 }\n')
    expect(JSON.parse(removeJsonValuesInSource(source, [['a'], ['c']]))).toEqual({ b: [2, 3] })
    expect(removeJsonValuesInSource('[1, 2]', [[0], [1]])).toBe('[]')
    expect(removeJsonValuesInSource('{"a":1,"b":2}', [['a'], ['b']])).toBe('{}')
  })
  it('rejects ancestor/descendant plans and invalid paths before editing', () => {
    expect(() => removeJsonValuesInSource('{"a":[1]}', [['a'], ['a', 0]])).toThrow(/overlap/)
    expect(() => removeJsonValuesInSource('[1]', [[0], [2]])).toThrow(/exist/)
    expect(() => removeJsonValuesInSource('[1]', [[]])).toThrow(/root/)
  })
  it('uses the same lossless value contract for capability checks and writes', () => {
    for (const value of [new Date(), { toJSON: () => 'lossy' }, [, 1], { get value() { throw new Error('getter called') } }]) {
      expect(jsonObjectFormat.canRepresent(value).representable).toBe(false)
    }
    expect(jsonObjectFormat.canRepresent({ value: -0 }).representable).toBe(true)
  })
})
