import { describeValuePath, type ValuePath } from '../json-path.js'
import { sourceDiagnosticHelp } from '../diagnostics.js'
import type {
  DocumentDiagnostic,
  FormatCapability,
  StructuredDocumentAdapter,
  ValueReplacement,
} from './document-format.js'

export interface CsvCellState {
  start: number
  end: number
  raw: string
  value: string
  quoted: boolean
}

export interface CsvRecordState {
  start: number
  end: number
  separatorStart: number
  separatorEnd: number
  cells: CsvCellState[]
}

export interface CsvDocumentState {
  headers: string[]
  records: CsvRecordState[]
  lineEnding: '\n' | '\r\n'
  bom: boolean
  finalNewline: boolean
  editable: boolean
}

interface ParsedCsv {
  state: CsvDocumentState
  diagnostics: DocumentDiagnostic[]
  fatal?: SyntaxError
}

function parseCsv(source: string): ParsedCsv {
  const diagnostics: DocumentDiagnostic[] = []
  const records: CsvRecordState[] = []
  const bom = source.charCodeAt(0) === 0xfeff
  let index = bom ? 1 : 0
  let firstLineEnding: '\n' | '\r\n' | undefined
  let fatal: SyntaxError | undefined

  while (index < source.length) {
    const recordStart = index
    const cells: CsvCellState[] = []
    let recordEnd = index
    let separatorStart = index
    let separatorEnd = index
    let finished = false
    while (!finished) {
      const start = index
      let value = ''
      let quoted = false
      if (source[index] === '"') {
        quoted = true
        index += 1
        let closed = false
        while (index < source.length) {
          if (source[index] !== '"') {
            value += source[index++]
            continue
          }
          if (source[index + 1] === '"') {
            value += '"'
            index += 2
            continue
          }
          index += 1
          closed = true
          break
        }
        if (!closed) {
          fatal = new SyntaxError('Unterminated quoted CSV cell')
          diagnostics.push({ code: 'unterminated-quote', message: fatal.message, severity: 'error', start, end: index })
        }
        if (closed && index < source.length && source[index] !== ',' && source[index] !== '\n' && source[index] !== '\r') {
          fatal = new SyntaxError('Unexpected content after a quoted CSV cell')
          diagnostics.push({ code: 'invalid-quoted-cell', message: fatal.message, severity: 'error', start, end: index + 1 })
          while (index < source.length && source[index] !== ',' && source[index] !== '\n' && source[index] !== '\r') index += 1
        }
      } else {
        while (index < source.length && source[index] !== ',' && source[index] !== '\n' && source[index] !== '\r') {
          if (source[index] === '"' && !fatal) {
            fatal = new SyntaxError('Quotes inside an unquoted CSV cell are invalid')
            diagnostics.push({ code: 'invalid-quote', message: fatal.message, severity: 'error', start: index, end: index + 1 })
          }
          value += source[index++]
        }
      }
      cells.push({ start, end: index, raw: source.slice(start, index), value, quoted })
      if (source[index] === ',') {
        index += 1
        if (index === source.length) {
          cells.push({ start: index, end: index, raw: '', value: '', quoted: false })
          recordEnd = index
          separatorStart = index
          separatorEnd = index
          finished = true
        }
        continue
      }
      recordEnd = index
      separatorStart = index
      if (source[index] === '\r' && source[index + 1] === '\n') {
        firstLineEnding ??= '\r\n'
        index += 2
      } else if (source[index] === '\n') {
        firstLineEnding ??= '\n'
        index += 1
      } else if (source[index] === '\r') {
        firstLineEnding ??= '\n'
        diagnostics.push({ code: 'bare-cr', message: 'Bare carriage returns are not a supported CSV line ending', severity: 'warning', start: index, end: index + 1 })
        index += 1
      }
      separatorEnd = index
      finished = true
    }
    records.push({ start: recordStart, end: recordEnd, separatorStart, separatorEnd, cells })
  }

  const headerRecord = records[0]
  const headers = headerRecord?.cells.map((cell) => cell.value) ?? []
  if (!headerRecord) diagnostics.push({ code: 'missing-header', message: 'CSV requires a header record', severity: 'error' })
  const seen = new Set<string>()
  headers.forEach((header, column) => {
    const cell = headerRecord.cells[column]
    if (!header) diagnostics.push({ code: 'missing-header', message: `Column ${column + 1} has an empty header`, severity: 'error', path: [column], start: cell.start, end: cell.end })
    else if (seen.has(header)) diagnostics.push({ code: 'duplicate-header', message: `Header ${JSON.stringify(header)} is duplicated`, severity: 'error', path: [column], start: cell.start, end: cell.end })
    seen.add(header)
  })
  records.slice(1).forEach((record, row) => {
    if (record.cells.length !== headers.length) diagnostics.push({
      code: 'irregular-row',
      message: `Row ${row + 2} has ${record.cells.length} cells; expected ${headers.length}`,
      severity: 'warning', path: [row], start: record.start, end: record.end,
    })
  })
  const editable = Boolean(headerRecord) && headers.length > 0 && headers.every(Boolean) && new Set(headers).size === headers.length && !fatal
  return {
    state: {
      headers,
      records,
      lineEnding: firstLineEnding ?? '\n',
      bom,
      finalNewline: Boolean(records.at(-1) && records.at(-1)!.separatorEnd > records.at(-1)!.separatorStart),
      editable,
    },
    diagnostics: diagnostics.map((item) => ({ ...item, help: sourceDiagnosticHelp(item.code) })),
    ...(fatal ? { fatal } : {}),
  }
}

function safelyRoundTripsNumber(value: string): boolean {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return false
  const number = Number(value)
  if (!Number.isFinite(number) || Object.is(number, -0)) return false
  if (Number.isInteger(number) && !Number.isSafeInteger(number)) return false
  return String(number) === value
}

function inferredColumns(state: CsvDocumentState): Array<'string' | 'number' | 'boolean'> {
  return state.headers.map((_header, column) => {
    const values = state.records.slice(1).map((record) => record.cells[column]?.value ?? '').filter((value) => value !== '')
    if (values.length > 0 && values.every((value) => value === 'true' || value === 'false')) return 'boolean'
    if (values.length > 0 && values.every(safelyRoundTripsNumber)) return 'number'
    return 'string'
  })
}

function normalizedRoot(state: CsvDocumentState): Array<Record<string, unknown>> {
  const types = inferredColumns(state)
  return state.records.slice(1).map((record) => Object.fromEntries(record.cells.map((cell, column) => {
    const original = state.headers[column]
    let key = original || `$column${column + 1}`
    if (state.headers.indexOf(key) !== column) key = `${key} [${column + 1}]`
    const value: unknown = cell.value === '' ? '' : types[column] === 'number' ? Number(cell.value) : types[column] === 'boolean' ? cell.value === 'true' : cell.value
    return [key, value]
  })))
}

function assertEditable(state: CsvDocumentState): void {
  if (!state.editable) throw new TypeError('Repair missing or duplicate CSV headers before structured editing')
}

function csvScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new TypeError('CSV cells can contain only strings, finite numbers, or booleans')
}

function encodeCell(value: unknown, forceQuote = false): string {
  const text = csvScalar(value)
  const quote = forceQuote || /[",\r\n]/.test(text) || /^\s|\s$/.test(text)
  return quote ? `"${text.replace(/"/g, '""')}"` : text
}

function cellForPath(state: CsvDocumentState, path: ValuePath): CsvCellState {
  assertEditable(state)
  if (path.length !== 2 || typeof path[0] !== 'number' || !Number.isSafeInteger(path[0]) || path[0] < 0 || typeof path[1] !== 'string') {
    throw new TypeError(`CSV path ${describeValuePath(path)} must identify a row and header`)
  }
  const column = state.headers.indexOf(path[1])
  const cell = state.records[path[0] + 1]?.cells[column]
  if (column < 0 || !cell) throw new RangeError(`CSV path ${describeValuePath(path)} does not exist`)
  return cell
}

function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>): string {
  const ordered = edits.sort((left, right) => left.start - right.start || left.end - right.end)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end || ordered[index].start === ordered[index - 1].start) throw new TypeError('CSV edits overlap')
  }
  let cursor = 0
  const parts: string[] = []
  ordered.forEach((edit) => {
    parts.push(source.slice(cursor, edit.start), edit.text)
    cursor = edit.end
  })
  parts.push(source.slice(cursor))
  return parts.join('')
}

export function inspectCsvSource(source: string): { root: Array<Record<string, unknown>>; state: CsvDocumentState; diagnostics: DocumentDiagnostic[] } {
  const parsed = parseCsv(source)
  return { root: normalizedRoot(parsed.state), state: parsed.state, diagnostics: parsed.diagnostics }
}

export function validateCsvSource(source: string): void {
  const parsed = parseCsv(source)
  if (parsed.fatal) throw parsed.fatal
}

export const csvFormat: StructuredDocumentAdapter<CsvDocumentState> = {
  format: 'csv',
  inspect: inspectCsvSource,
  validate: validateCsvSource,
  replace(source, state, path, value) {
    const cell = cellForPath(state, path)
    return applyEdits(source, [{ start: cell.start, end: cell.end, text: encodeCell(value, cell.quoted) }])
  },
  replaceMany(source, state, changes) {
    const edits = changes.map(({ path, value }) => {
      const cell = cellForPath(state, path)
      return { start: cell.start, end: cell.end, text: encodeCell(value, cell.quoted) }
    })
    return applyEdits(source, edits)
  },
  removeMany(source, state, paths) {
    assertEditable(state)
    const rows = [...new Set(paths.map((path) => {
      if (path.length !== 1 || typeof path[0] !== 'number' || !Number.isSafeInteger(path[0]) || path[0] < 0) throw new TypeError(`CSV path ${describeValuePath(path)} must identify a row`)
      if (!state.records[path[0] + 1]) throw new RangeError(`CSV row ${path[0]} does not exist`)
      return path[0]
    }))].sort((a, b) => a - b)
    const edits: Array<{ start: number; end: number; text: string }> = []
    for (let cursor = 0; cursor < rows.length; cursor++) {
      const first = rows[cursor]
      let last = first
      while (rows[cursor + 1] === last + 1) last = rows[++cursor]
      const start = state.records[first + 1]
      const end = state.records[last + 1]
      edits.push(end.separatorEnd > end.separatorStart
        ? { start: start.start, end: end.separatorEnd, text: '' }
        : { start: state.records[first].separatorStart, end: end.end, text: '' })
    }
    return applyEdits(source, edits)
  },
  append(source, state, path, value) {
    assertEditable(state)
    if (path.length !== 0 || value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('CSV rows must be appended to the document root as objects')
    }
    const row = value as Record<string, unknown>
    if (Object.keys(row).some((key) => !state.headers.includes(key))) throw new TypeError('CSV rows cannot contain properties missing from the header')
    const encoded = state.headers.map((header) => encodeCell(Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '')).join(',')
    const separator = state.lineEnding
    return state.finalNewline ? `${source}${encoded}${separator}` : `${source}${separator}${encoded}`
  },
  canRepresent(value): FormatCapability {
    try { csvScalar(value); return { representable: true } }
    catch { return { representable: false, reason: 'CSV cells cannot represent nested values or null distinctly from an empty cell' } }
  },
}

export type { ValueReplacement }
