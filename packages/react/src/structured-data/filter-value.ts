import { compareJsonNumberTokens, inspectJsonSource } from '@script-it/json-views-core'

const PRECISION_ERROR = 'This filter value needs exact numeric source text. Define the filter in JSON source to preserve its precision.'

/** Never silently round a value typed into a filter or saved-view editor. */
export function parseFilterValue(value: string, kind?: string): unknown {
  if (kind === 'string') return value
  if (kind === 'boolean') return value === 'true'
  if (kind === 'number') {
    const token = value.trim()
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)) return value
    const number = Number(token)
    if (!Number.isFinite(number) || compareJsonNumberTokens(token, String(number)) !== 0) throw new Error(PRECISION_ERROR)
    return number
  }
  let inspected: ReturnType<typeof inspectJsonSource>
  try { inspected = inspectJsonSource(value) } catch { return value }
  if (inspected.diagnostics.some((issue) => issue.code === 'unsafe-number')) throw new Error(PRECISION_ERROR)
  return inspected.value
}
