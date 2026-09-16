import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareJsonNumberTokens, compareJsonValues, jsonValuesEqual, matchesJsonValueFilter } from '../src/value-comparison'
import { inspectJsonSource } from '../src/json-source-patcher'
import { compileJsonViewMetadata } from '../src/metadata'
import { applyJsonViewViewRows } from '../src/view-model'
import type { ValuePath } from '../src/json-path'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/json-edge-cases/${name}.json`, import.meta.url), 'utf8')
function inspection(source: string) {
  const { value, diagnostics } = inspectJsonSource(source)
  const tokens = new Map(diagnostics.filter((d) => d.code === 'unsafe-number' && !d.shadowed).map((d) => [JSON.stringify(d.sourcePath), d.token]))
  return { value, numberAtPath: (path?: ValuePath | null) => tokens.get(JSON.stringify(path)) }
}

describe('exact JSON value comparison', () => {
  it.each([
    ['9007199254740992', '9007199254740993'],
    ['0.123456789012345678901', '0.123456789012345678902'],
    ['1e400', '2e400'], ['1e-400', '2e-400'], ['-2e400', '-1e400'],
    ['-1e-400', '0'], ['1e999999999999999999999', '1e1000000000000000000000'],
  ])('orders %s before %s without rounding', (a, b) => {
    expect(compareJsonNumberTokens(a, b)).toBe(-1)
    expect(compareJsonNumberTokens(b, a)).toBe(1)
  })
  it.each([['1.00', '10e-1'], ['-0', '0'], ['12300', '1.23e4']])('recognizes equivalent decimals %s and %s', (a, b) => {
    expect(compareJsonNumberTokens(a, b)).toBe(0)
  })
  it('sorts objects with legal coercion-method keys without invoking them', () => {
    const rows = JSON.parse(fixture('object-sort'))
    expect(compareJsonValues(rows[0].payload, rows[1].payload)).toBeLessThan(0)
    expect(compareJsonValues(rows[1].payload, rows[0].payload)).toBeGreaterThan(0)
    expect(jsonValuesEqual(JSON.parse('{"toString":null,"__proto__":1}'), JSON.parse('{"__proto__":1,"toString":null}'))).toBe(true)
    expect(jsonValuesEqual({ a: 1 }, { A: 1 })).toBe(false)
    expect(compareJsonValues([1, 2], [1, 3])).toBeLessThan(0)
  })
  it('compares exact numbers recursively and in membership filters', () => {
    const { value, numberAtPath } = inspection(fixture('large-integer-sort'))
    const rows = value as Array<{ name: string; id: number }>
    const context = { numberAtPath, leftPath: [0, 'id'], rightPath: [1, 'id'] }
    expect(rows[0].id).toBe(rows[1].id) // Native numbers have already lost this distinction.
    expect(jsonValuesEqual(rows[0].id, rows[1].id, context)).toBe(false)
    expect(matchesJsonValueFilter(rows[0].id, 'gt', rows[1].id, context)).toBe(true)
    const nested = inspection('{"a":[9007199254740993],"b":[9007199254740992]}')
    const n = nested.value as { a: number[]; b: number[] }
    expect(jsonValuesEqual(n.a, n.b, { numberAtPath: nested.numberAtPath, leftPath: ['a'], rightPath: ['b'] })).toBe(false)
    expect(matchesJsonValueFilter(n.a[0], 'in', n.b, { numberAtPath: nested.numberAtPath, leftPath: ['a', 0], rightPath: ['b'] })).toBe(false)
  })
  it('does not reuse embedded operand tokens for an external or preview filter', () => {
    const { value, numberAtPath } = inspection('{"rows":[{"id":9007199254740993},{"id":9007199254740992}],"$jsonviews":{"version":1,"views":[{"id":"v","name":"V","path":"$.rows","filter":{"rules":[{"path":"$.rows[*].id","operator":"eq","value":9007199254740993}]}}]}}')
    const metadata = { version: 1, views: [{ id: 'v', name: 'V', path: '$.rows', filter: { rules: [{ path: '$.rows[*].id', operator: 'eq', value: 9007199254740992 }] } }] }
    const compiled = compileJsonViewMetadata(value, undefined, { metadata })
    expect(applyJsonViewViewRows(value, compiled.views[0], compiled.schema, undefined, numberAtPath).map((r) => r.sourcePath)).toEqual([['rows', 1]])
  })
  it.each(['asc', 'desc'] as const)('uses source tokens in saved-view %s sorting and exact filter operands', (direction) => {
    const { value, numberAtPath } = inspection(`{
      "rows":[{"id":9007199254740993},{"id":9007199254740992}],
      "$jsonviews":{"version":1,"views":[{"id":"numbers","name":"Numbers","path":"$.rows",
        "sort":[{"path":"$.rows[*].id","direction":"${direction}"}],
        "filter":{"rules":[{"path":"$.rows[*].id","operator":"eq","value":9007199254740993}]}}]}}
    `)
    const compiled = compileJsonViewMetadata(value)
    const view = compiled.views[0]
    expect(applyJsonViewViewRows(value, { ...view, filter: undefined }, compiled.schema, undefined, numberAtPath).map((r) => r.sourcePath)).toEqual(direction === 'asc' ? [['rows', 1], ['rows', 0]] : [['rows', 0], ['rows', 1]])
    expect(applyJsonViewViewRows(value, view, compiled.schema, undefined, numberAtPath).map((r) => r.sourcePath)).toEqual([['rows', 0]])
  })
})
