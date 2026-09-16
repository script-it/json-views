import { describe, expect, it } from 'vitest'
import { csvFormat, inspectCsvSource, validateCsvSource } from '../src/formats/csv-format.js'

describe('CSV format adapter', () => {
  it('never treats the header or fractional indices as a data row', () => {
    const source = 'name\nAda\nGrace'
    const { state } = inspectCsvSource(source)
    for (const row of [-1, -2, 0.5, NaN, Infinity]) {
      expect(() => csvFormat.replace(source, state, [row, 'name'], 'bad')).toThrow()
      expect(() => csvFormat.removeMany(source, state, [[row]])).toThrow()
    }
  })

  it('removes adjacent final rows without a trailing newline', () => {
    const source = 'id\r\n1\r\n2\r\n3'
    const { state } = inspectCsvSource(source)
    expect(csvFormat.removeMany(source, state, [[2], [1], [1]])).toBe('id\r\n1')
    expect(csvFormat.removeMany(source, state, [[0], [1], [2]])).toBe('id')
    expect(csvFormat.removeMany(source, state, [[0], [2]])).toBe('id\r\n2')
  })

  it('rejects duplicate writes to empty cells and extra row properties', () => {
    const source = 'a,b\n,2'
    const { state } = inspectCsvSource(source)
    expect(() => csvFormat.replaceMany(source, state, [{ path: [0, 'a'], value: 1 }, { path: [0, 'a'], value: 2 }])).toThrow(/overlap/)
    expect(() => csvFormat.append(source, state, [], { a: 1, b: 2, dropped: 3 })).toThrow(/header/)
  })
  it('reads quotes, commas, multiline cells, Unicode, BOM, CRLF and empty values', () => {
    const source = '\ufeffid,name,note,empty,enabled\r\n00123,"García, Ana","one\r\ntwo",,true\r\n'
    const inspected = inspectCsvSource(source)
    expect(inspected.root).toEqual([{ id: '00123', name: 'García, Ana', note: 'one\r\ntwo', empty: '', enabled: true }])
    expect(inspected.state).toMatchObject({ bom: true, lineEnding: '\r\n', finalNewline: true, editable: true })
    expect(inspected.diagnostics).toEqual([])
  })

  it('infers numbers only when every value round-trips safely', () => {
    expect(inspectCsvSource('safe,leading,unsafe\n1,00123,9007199254740993\n2,00124,3\n').root).toEqual([
      { safe: 1, leading: '00123', unsafe: '9007199254740993' },
      { safe: 2, leading: '00124', unsafe: '3' },
    ])
  })

  it('patches only the selected cell and preserves its quoting style', () => {
    const source = 'id,name,note\r\n1,"Ada","hello, world"\r\n2,Grace,plain\r\n'
    const { state } = inspectCsvSource(source)
    const next = csvFormat.replace(source, state, [0, 'name'], 'Ana "A"')
    expect(next).toBe('id,name,note\r\n1,"Ana ""A""","hello, world"\r\n2,Grace,plain\r\n')
    expect(next.slice(next.indexOf(',"hello'))).toBe(source.slice(source.indexOf(',"hello')))
  })

  it('replaces multiple cells, removes rows, and appends with the original newline policy', () => {
    const source = 'id,active\r\n1,true\r\n2,false\r\n3,true\r\n'
    const inspected = inspectCsvSource(source)
    const replaced = csvFormat.replaceMany(source, inspected.state, [
      { path: [0, 'id'], value: 10 },
      { path: [2, 'active'], value: false },
    ])
    expect(replaced).toBe('id,active\r\n10,true\r\n2,false\r\n3,false\r\n')
    const removed = csvFormat.removeMany(source, inspected.state, [[0], [1]])
    expect(removed).toBe('id,active\r\n3,true\r\n')
    const remaining = inspectCsvSource(removed)
    expect(csvFormat.append(removed, remaining.state, [], { id: 4, active: false })).toBe('id,active\r\n3,true\r\n4,false\r\n')
  })

  it('diagnoses irregular and non-editable headers while keeping rows inspectable', () => {
    const inspected = inspectCsvSource('name,name,\nAda,Lovelace\n')
    expect(inspected.root).toEqual([{ name: 'Ada', 'name [2]': 'Lovelace' }])
    expect(inspected.state.editable).toBe(false)
    expect(inspected.diagnostics.map((item) => item.code)).toEqual(['duplicate-header', 'missing-header', 'irregular-row'])
    expect(() => csvFormat.replace('name,name,\nAda,Lovelace\n', inspected.state, [0, 'name'], 'Grace')).toThrow(/Repair/)
  })

  it('rejects malformed CSV validation and nested cell values', () => {
    expect(() => validateCsvSource('a\n"unterminated')).toThrow(/Unterminated/)
    expect(csvFormat.canRepresent({ nested: true })).toMatchObject({ representable: false })
  })
})
