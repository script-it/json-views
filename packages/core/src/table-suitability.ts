/** Conservative eligibility shared by predicted views and automatic JSON tables. */

const MIN_RECORDS = 2
const MAX_SAMPLE_ROWS = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isReadable(value: unknown): boolean {
  return typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.trim().length > 0)
}

/** Arrays imply rows; dictionaries need a substantial shared field structure. */
export function isJsonViewTableCandidate(value: unknown): boolean {
  const rows = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []
  if (rows.length < MIN_RECORDS || !rows.every(isRecord)) return false
  const fields = rows.map((row) => Object.keys(row).filter((key) => key !== '$jsonviews'))
  if (Array.isArray(value)) return fields.some((keys) => keys.length > 0)

  // Inspect the whole dictionary so late, unrelated sections cannot be missed.
  // Nested values remain intact: only the fields used as columns matter here.
  const counts = new Map<string, number>()
  for (const keys of fields) {
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const shared = new Set([...counts].filter(([, count]) => count / rows.length >= 0.8).map(([key]) => key))
  return shared.size > 0 && shared.size / counts.size >= 0.5
    && fields.every((keys) => keys.some((key) => shared.has(key)))
}

/** Shared scalar paths only; never explodes arrays or rewrites source records. */
export function inferFlatColumnPaths(value: unknown): string[][] | undefined {
  if (!Array.isArray(value) || value.length < MIN_RECORDS || !value.every(isRecord)) return undefined
  const sample = value.slice(0, MAX_SAMPLE_ROWS)
  const shapes = sample.map((row) => {
    const paths: string[][] = []
    let invalid = false
    const visit = (record: Record<string, unknown>, prefix: string[]): void => {
      for (const [key, item] of Object.entries(record)) {
        if (key === '$jsonviews') continue
        const path = [...prefix, key]
        if (isRecord(item) && prefix.length < 2) visit(item, path)
        else if (item === null || isReadable(item)) paths.push(path)
        else invalid = true
        if (paths.length > 12) { invalid = true; return }
      }
    }
    visit(row, [])
    return invalid ? undefined : paths
  })
  if (shapes.some((shape) => !shape)) return undefined
  const paths = shapes[0]!
  if (paths.length < 2 || !paths.some((path) => path.length > 1)) return undefined
  const shared = paths.filter((path) => shapes.every((shape) => shape!.some((other) => JSON.stringify(path) === JSON.stringify(other))))
  if (shared.length / Math.max(...shapes.map((shape) => shape!.length)) < 0.8) return undefined
  return shared
}
