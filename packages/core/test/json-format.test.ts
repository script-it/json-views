import { describe, expect, it } from 'vitest'
import { formatJsonSource } from '../src/formats/json-format.js'

describe('formatJsonSource', () => {
  it('formats source without changing duplicate keys or numeric spelling', () => {
    const source = '{ "id":9007199254740993,"huge":1e400,"minusZero":-0,"x":1,"x":2 }\n'

    expect(formatJsonSource(source)).toBe(`{
  "id": 9007199254740993,
  "huge": 1e400,
  "minusZero": -0,
  "x": 1,
  "x": 2
}`)
  })

  it('rejects invalid JSON', () => {
    expect(() => formatJsonSource('{')).toThrow()
  })
})
