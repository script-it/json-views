import { describe, expect, it } from 'vitest'
import { isJsonViewTableCandidate } from '../src/table-suitability'
import { inferJsonViewMetadata } from '../src/inference'

const contacts = [
  { name: 'Ada', email: 'ada@example.com' },
  { name: 'Grace', email: 'grace@example.com' },
  { name: 'Katherine', email: 'katherine@example.com' },
]

describe('table prediction', () => {
  it('keeps unrelated object sections out of automatic tables', () => {
    const settings = { database: { host: 'db' }, logging: { level: 'info' } }
    expect(isJsonViewTableCandidate(settings)).toBe(false)
    expect(inferJsonViewMetadata(settings).views).toEqual([])
    expect(inferJsonViewMetadata({ settings }).views).toEqual([])
    expect(isJsonViewTableCandidate(Object.values(settings))).toBe(true)
  })

  it('allows optional dictionary fields and retains a shared core with missing values', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      name: `Person ${i}`, ...(i > 0 ? { email: null } : {}),
      ...(i === 0 ? { note: 'optional', active: true } : {}),
    }))
    expect(isJsonViewTableCandidate(Object.fromEntries(rows.map((row, i) => [i, row])))).toBe(true)
  })

  it('rejects sparse dictionaries, empty entries, and unrelated entries beyond the sample', () => {
    expect(isJsonViewTableCandidate({ a: { id: 1, x: 1 }, b: { id: 2, y: 1 }, c: { id: 3, z: 1 } })).toBe(false)
    expect(isJsonViewTableCandidate({ a: { name: 'Ada' }, b: {} })).toBe(false)
    const records = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, { name: `Person ${i}`, score: i }]))
    expect(isJsonViewTableCandidate({ ...records, settings: { enabled: true } })).toBe(false)
    expect(isJsonViewTableCandidate({ a: { $jsonviews: {} }, b: { $jsonviews: {} } })).toBe(false)
  })

  it('accepts useful rows and dictionaries, independent of collection names', () => {
    expect(isJsonViewTableCandidate(contacts)).toBe(true)
    expect(isJsonViewTableCandidate(Object.fromEntries(contacts.map((row, i) => [i, row])))).toBe(true)
    for (const key of ['items', 'children', 'unfamiliar']) {
      expect(inferJsonViewMetadata({ [key]: contacts }).views).toHaveLength(1)
    }
  })

  it('accepts two records for arrays, dictionaries, and nested scalar columns', () => {
    const rows = contacts.slice(0, 2)
    expect(isJsonViewTableCandidate(rows)).toBe(true)
    expect(isJsonViewTableCandidate(Object.fromEntries(rows.map((row, i) => [i, row])))).toBe(true)
    expect(isJsonViewTableCandidate(rows.map((row) => ({ person: row })))).toBe(true)
    expect(inferJsonViewMetadata({ rows }).views[0]?.path).toBe('$.rows')
  })

  it.each([[], contacts.slice(0, 1), [{}, {}], [{ name: 'Ada' }, 'Grace'], [1, 2]])('rejects values without a record table %#', (rows) => {
    expect(isJsonViewTableCandidate(rows)).toBe(false)
  })

  it.each([
    [{ name: 'Ada' }, { name: 'Grace' }],
    [{ name: 'Ada', tags: ['engineering'] }, { name: 'Grace', tags: ['design'] }],
    [{ name: 'Ada' }, { score: 2 }],
    [{ name: '' }, { name: null }],
    [{ name: 'Same' }, { name: 'Same' }],
    [{}, { payload: { nested: true } }],
  ].map((rows) => [rows]))('accepts renderable records without scalar or shared-shape gates %#', (rows) => {
    expect(isJsonViewTableCandidate(rows)).toBe(true)
    expect(inferJsonViewMetadata({ rows }).views[0]?.path).toBe('$.rows')
  })

  it('recognizes insights despite long body text and long example lists', () => {
    const insights = contacts.map((row, i) => ({
      id: row.name, polarity: 'reinforce', text: 'Long insight. '.repeat(100),
      weight: i, examples: ['path/to/example: '.repeat(100)],
    }))
    expect(isJsonViewTableCandidate(insights)).toBe(true)
    expect(inferJsonViewMetadata({ owner: 'script-it', repo: 'script.it', insights }).views[0]?.path).toBe('$.insights')
    for (const payload of [{ content: 'Long content'.repeat(100) }, { a: 1, b: 2, c: 3, d: 4 }]) {
      expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, payload })))).toBe(true)
    }
  })

  it('counts long body text as a comparable column without assigning a special type', () => {
    const rows = [{ id: 'one', text: 'First long text. '.repeat(30) }, { id: 'two', text: 'Second long text. '.repeat(30) }]
    expect(isJsonViewTableCandidate(rows)).toBe(true)
    const inferred = inferJsonViewMetadata({ rows })
    expect(inferred.views[0]?.path).toBe('$.rows')
    expect(inferred.schema['$.rows[*].text']?.type).toBe('text')
    expect(isJsonViewTableCandidate(rows.map((row) => ({ ...row, text: rows[0].text })))).toBe(true)
  })

  it('tolerates optional fields when four stable comparison columns exist', () => {
    const rows = contacts.map((row, i) => ({ ...row, rank: i, active: i > 0 }))
    expect(isJsonViewTableCandidate([{ ...rows[0], extra: 'optional' }, ...rows.slice(1)])).toBe(true)
    expect(isJsonViewTableCandidate([{ ...rows[0], extra: 'optional', another: true }, ...rows.slice(1)])).toBe(true)
  })

  it('accepts a stable comparison core with optional enrichment and large nested details', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      keyword: `Keyword ${i}`, volume: i, score: i + 1, rank: i + 2,
      ...(i % 2 ? { optional: 'extra' } : {}),
      results: Array.from({ length: 20 }, (_, j) => ({ title: `Result ${j}`, body: 'detail' })),
    }))
    expect(isJsonViewTableCandidate(Object.fromEntries(records.map((row) => [row.keyword, row])))).toBe(true)
  })

  it('keeps uniform scalar records tabular with null or constant columns', () => {
    expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, email: null })))).toBe(true)
    expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, email: 'same@example.com' })))).toBe(true)
  })

  it('accepts short tags and nested record arrays', () => {
    expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, tags: ['one', 'two'] })))).toBe(true)
    expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, tags: [{ name: 'one' }] })))).toBe(true)
  })

  it('uses the first ten records without traversing nested details', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ name: `Name ${i}`, score: i }))
    expect(isJsonViewTableCandidate([...rows, { unrelated: true }])).toBe(true)
    expect(isJsonViewTableCandidate([ ...rows.slice(0, 9), { unrelated: true }, ...rows.slice(9) ])).toBe(true)
    expect(isJsonViewTableCandidate([...rows.slice(0, 10).map((row) => ({ person: row })), { unrelated: true }])).toBe(true)
    expect(isJsonViewTableCandidate(contacts.map((row) => ({ ...row, payload: Array(10_001).fill({ name: 'hidden' }) })))).toBe(true)
  })

  it('keeps collections belonging to individual records out of document tabs', () => {
    const config = { a: { enabled: true }, b: { enabled: false, contacts } }
    expect(inferJsonViewMetadata(config).views).toEqual([])
  })
})

describe('conservative board prediction', () => {
  const tasks = Array.from({ length: 4 }, (_, i) => ({ title: `Task ${i}`, status: i % 2 ? 'Done' : 'Open' }))

  it('adds a board for named records with recurring workflow stages', () => {
    expect(inferJsonViewMetadata({ tasks }).views.map((view) => view.display ?? 'table')).toEqual(['table', 'kanban'])
  })

  it('requires more than a grouping field name', () => {
    for (const rows of [
      tasks.slice(0, 3),
      tasks.map((row, i) => ({ ...row, status: `Status ${i}` })),
      tasks.map(({ title, status }) => ({ title, type: status })),
      tasks.map(({ title, status }) => ({ title, priority: status })),
      tasks.map(({ title, status }) => ({ id: title, status })),
    ]) expect(inferJsonViewMetadata({ rows }).views.map((view) => view.display ?? 'table')).toEqual(['table'])
  })

  it('rejects unexpected groups beyond the schema sample', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ title: `Task ${i}`, status: i < 10 ? tasks[i % 4].status : `Other ${i}` }))
    expect(inferJsonViewMetadata({ rows }).views.map((view) => view.display ?? 'table')).toEqual(['table'])
  })
})
