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

/** Two or more records with fields can render as rows and columns. */
export function isJsonViewTableCandidate(value: unknown): boolean {
  const rows = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []
  return rows.length >= MIN_RECORDS && rows.every(isRecord)
    && rows.some((row) => Object.keys(row).some((key) => key !== '$jsonviews'))
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
