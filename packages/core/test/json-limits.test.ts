import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_JSON_DEPTH, JsonDepthLimitError } from '../src/json-limits'
import { inspectJsonSource, replaceJsonValueInSource, stringifyJsonValue } from '../src/json-source-patcher'
import { compileJsonViewMetadata } from '../src/metadata'
import { formatJsonSource } from '../src/formats/json-format'

const nested = (depth: number) => '['.repeat(depth) + '0' + ']'.repeat(depth)
describe('bounded JSON nesting', () => {
  it.each([MAX_JSON_DEPTH - 1, MAX_JSON_DEPTH])('supports %i containers and preserves source edits', (depth) => {
    const source = nested(depth)
    expect(() => inspectJsonSource(source)).not.toThrow()
    expect(() => compileJsonViewMetadata(JSON.parse(source))).not.toThrow()
    expect(stringifyJsonValue(JSON.parse(source))).toBe(source)
    expect(replaceJsonValueInSource(source, Array(depth).fill(0), 1)).toBe(source.replace('0', '1'))
  })
  it.each([MAX_JSON_DEPTH + 1, 3000])('reports a typed resource limit for valid depth %i', (depth) => {
    const source = depth === 3000 ? readFileSync(new URL('./fixtures/json-edge-cases/deep-nesting.json', import.meta.url), 'utf8') : nested(depth)
    const value = JSON.parse(source)
    for (const operation of [() => inspectJsonSource(source), () => compileJsonViewMetadata(value), () => stringifyJsonValue(value), () => formatJsonSource(source), () => replaceJsonValueInSource(source, [], 1)]) {
      expect(operation).toThrow(JsonDepthLimitError)
      expect(operation).toThrow(/supported nesting limit of 512/)
    }
  })
  it('does not count braces inside escaped strings as nesting', () => {
    expect(() => inspectJsonSource(JSON.stringify({ text: '[{\\"'.repeat(3000) }))).not.toThrow()
  })
})
