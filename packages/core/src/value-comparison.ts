import { assertJsonDepth } from './json-limits.js'
import type { ValuePath } from './json-path.js'

/** Optional source tokens keep numeric comparisons independent of JS rounding. */
export type JsonNumberLookup = (path?: ValuePath | null) => string | undefined
export interface JsonComparisonContext {
  numberAtPath?: JsonNumberLookup
  leftPath?: ValuePath
  rightPath?: ValuePath
}

const NUMBER = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/
function decimal(token: string) {
  const match = NUMBER.exec(token)
  if (!match) throw new TypeError('Expected a JSON number token')
  const fraction = match[3] ?? ''
  const digits = (match[2] + fraction).replace(/^0+/, '').replace(/0+$/, '')
  const raw = (match[2] + fraction).replace(/^0+/, '')
  return {
    sign: digits ? (match[1] ? -1 : 1) : 0,
    digits,
    magnitude: BigInt(match[4] ?? '0') - BigInt(fraction.length) + BigInt(raw.length),
  }
}

/** Exact decimal ordering, including overflow/underflow and arbitrarily large exponents.
 * Work is proportional to token length; exponents never cause zero-filled expansion.
 */
export function compareJsonNumberTokens(left: string, right: string): number {
  const a = decimal(left), b = decimal(right)
  if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1
  if (!a.sign) return 0
  if (a.magnitude !== b.magnitude) return (a.magnitude < b.magnitude ? -1 : 1) * a.sign
  for (let index = 0; index < Math.max(a.digits.length, b.digits.length); index++) {
    const l = a.digits[index] ?? '0', r = b.digits[index] ?? '0'
    if (l !== r) return (l < r ? -1 : 1) * a.sign
  }
  return 0
}

function rank(value: unknown): number {
  if (value === null) return 5
  if (typeof value === 'boolean') return 0
  if (typeof value === 'number') return 1
  if (typeof value === 'string') return 2
  if (Array.isArray(value)) return 3
  if (typeof value === 'object') return 4
  return 6 // Missing values are last.
}
const child = (path: ValuePath | undefined, key: string | number) => path && [...path, key]

function compare(left: unknown, right: unknown, context: JsonComparisonContext, strict: boolean): number {
  assertJsonDepth(left)
  assertJsonDepth(right)
  const pending = [{ left, right, context }]
  while (pending.length) {
    const { left: a, right: b, context: ctx } = pending.pop()!
    const ar = rank(a), br = rank(b)
    if (ar !== br) return ar < br ? -1 : 1
    if (typeof a === 'number' && typeof b === 'number') {
      const at = ctx.numberAtPath?.(ctx.leftPath) ?? (Number.isFinite(a) ? String(a) : undefined)
      const bt = ctx.numberAtPath?.(ctx.rightPath) ?? (Number.isFinite(b) ? String(b) : undefined)
      const result = at !== undefined && bt !== undefined ? compareJsonNumberTokens(at, bt)
        : Object.is(a, b) ? 0 : a < b ? -1 : 1
      if (result) return result
    } else if (typeof a === 'string' && typeof b === 'string') {
      const result = strict ? (a === b ? 0 : a < b ? -1 : 1) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      if (result) return result
    } else if (typeof a === 'boolean' && typeof b === 'boolean') {
      if (a !== b) return a ? 1 : -1
    } else if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      const ak = Array.isArray(a) ? a.map((_, index) => index) : Object.keys(a).sort()
      const bk = Array.isArray(b) ? b.map((_, index) => index) : Object.keys(b).sort()
      // Length is a final tie-break, after lexicographic key/value comparison.
      pending.push({ left: ak.length, right: bk.length, context: {} })
      for (let index = Math.min(ak.length, bk.length) - 1; index >= 0; index--) {
        const key = ak[index], other = bk[index]
        pending.push({ left: (a as Record<string | number, unknown>)[key], right: (b as Record<string | number, unknown>)[other],
          context: { ...ctx, leftPath: child(ctx.leftPath, key), rightPath: child(ctx.rightPath, other) } })
        // Keys are JSON data too; never call methods supplied by an object.
        pending.push({ left: key, right: other, context: {} })
      }
    }
  }
  return 0
}

/** Total type ordering, then numeric/text/lexicographic container ordering. */
export function compareJsonValues(left: unknown, right: unknown, context: JsonComparisonContext = {}): number {
  return compare(left, right, context, false)
}
export function jsonValuesEqual(left: unknown, right: unknown, context: JsonComparisonContext = {}): boolean {
  return compare(left, right, context, true) === 0
}

/** Text conversion that never invokes a JSON object's own toString/valueOf. */
export function jsonValueText(value: unknown): string {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function matchesJsonValueFilter(value: unknown, operator: string, expected?: unknown, context: JsonComparisonContext = {}): boolean {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (operator === 'isEmpty') return empty
  if (operator === 'isNotEmpty') return !empty
  const equal = (a: unknown, b: unknown, ctx = context) => jsonValuesEqual(a, b, ctx)
  if (operator === 'eq') return equal(value, expected)
  if (operator === 'neq') return !equal(value, expected)
  if (operator === 'in' || operator === 'notIn') {
    const found = Array.isArray(expected) && expected.some((candidate, index) => equal(value, candidate, { ...context, rightPath: child(context.rightPath, index) }))
    return operator === 'in' ? found : !found
  }
  if (operator === 'contains' || operator === 'notContains') {
    const found = typeof value === 'string' ? value.toLocaleLowerCase().includes(jsonValueText(expected ?? '').toLocaleLowerCase())
      : Array.isArray(value) && value.some((candidate, index) => equal(candidate, expected, { ...context, leftPath: child(context.leftPath, index) }))
    return operator === 'contains' ? found : !found
  }
  const ordered = compareJsonValues(value, expected, context)
  if (operator === 'gt') return ordered > 0
  if (operator === 'gte') return ordered >= 0
  if (operator === 'lt') return ordered < 0
  if (operator === 'lte') return ordered <= 0
  return false
}
