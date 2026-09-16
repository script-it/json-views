import { describe, expect, it } from 'vitest'

import { inferJsonViewMetadata, inferJsonViewRecordTitleKey } from '../src/inference'
import { compileJsonViewMetadata } from '../src/metadata'

describe('JSON view inference', () => {
  it('keeps identifier formats as text regardless of field name', () => {
    const schema = inferJsonViewMetadata([
      { arbitrary: '3c0ec4e5-8f15-8185-acc2-f4cdca0e1961', hash: '0123456789abcdef'.repeat(4), prose: 'A readable paragraph that should be shown as the record body.' },
      { arbitrary: '3c0ec4e5-8f15-8185-acc2-f4cdca0e1962', hash: 'abcdef0123456789'.repeat(4), prose: 'Another readable paragraph that belongs in the record body.' },
    ]).schema
    expect(schema['$[*].arbitrary']?.type).toBe('text')
    expect(schema['$[*].hash']?.type).toBe('text')
    expect(schema['$[*].prose']?.type).toBe('text')
  })
  it('infers select from two repeated strings but keeps unique strings as text', () => {
    expect(inferJsonViewMetadata([{ category: 'A' }, { category: 'A' }]).schema['$[*].category']?.type).toBe('select')
    expect(inferJsonViewMetadata([{ category: 'A' }, { category: 'B' }]).schema['$[*].category']?.type).toBe('text')
  })
  it('uses one shared descriptor for dictionary records without concrete text overrides', () => {
    const root = { records: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [
      `record${index}`, { competitor: index % 2 ? 'n8n' : 'Lindy', url: `https://example.com/${index}` },
    ])) }
    const inferred = inferJsonViewMetadata(root)
    expect(inferred.schema['$.records[*].competitor']?.type).toBe('select')
    expect(Object.keys(inferred.schema).some((path) => path.includes('record0.'))).toBe(false)
    const compiled = compileJsonViewMetadata(root)
    expect(compiled.schema.filter((entry) => entry.descriptor.type === 'text')).toHaveLength(0)
  })
  it('does not promote child collections of individual dictionary records', () => {
    const serp = Array.from({ length: 4 }, (_, i) => ({ title: `Result ${i}`, position: i }))
    const inferred = inferJsonViewMetadata({
      keywordA: { keyword: 'A', serp },
      keywordB: { keyword: 'B', serp },
      keywordC: { keyword: 'C', serp },
    })
    expect(inferred.views).toEqual([])
    expect(inferred.schema['$[*].serp']).toBeUndefined()
  })

  it('infers single-select from repeated values regardless of field name', () => {
    const inferred = inferJsonViewMetadata({ records: Array.from({ length: 6 }, (_, i) => ({
      name: i % 2 ? 'Ada' : 'Grace',
      id: i % 2 ? 'one' : 'two',
      priority: i % 2 ? 'High' : 'Low',
      tags: i % 2 ? ['Engineering'] : ['Product'],
      processed_ids: ['abc', 'def'],
      news_urls: ['https://example.com/feed'],
    })) })
    expect(inferred.schema['$.records[*].name']?.type).toBe('select')
    expect(inferred.schema['$.records[*].id']?.type).toBe('select')
    expect(inferred.schema['$.records[*].priority']?.type).toBe('select')
    expect(inferred.schema['$.records[*].tags']?.type).toBe('multi-select')
    expect(inferred.schema['$.records[*].processed_ids']?.type).toBe('multi-select')
    expect(inferred.schema['$.records[*].news_urls']).toBeUndefined()
    expect(inferJsonViewMetadata({ status: 'Healthy' }).schema['$.status']?.type).toBe('text')
  })

  it('infers single-select for arbitrary keys with a singleton option', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      polarity: i === 5 ? 'suppress' : 'reinforce',
      custom_field: i === 5 ? 'rare' : 'common',
      unique: `Value ${i}`,
    }))
    const schema = inferJsonViewMetadata({ rows }).schema
    expect(schema['$.rows[*].polarity']).toMatchObject({ type: 'select', options: ['reinforce', 'suppress'] })
    expect(schema['$.rows[*].custom_field']).toMatchObject({ type: 'select', options: ['common', 'rare'] })
    expect(schema['$.rows[*].unique']?.type).toBe('text')
  })

  it('infers fields from only the first ten records', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `Person ${i}`, score: i }))
    const schema = inferJsonViewMetadata({ rows: [...rows, { name: 'Later', score: 'different', laterOnly: true }] }).schema
    expect(schema['$.rows[*].score']?.type).toBe('number')
    expect(schema['$.rows[*].laterOnly']).toBeUndefined()
  })

  it('keeps health metrics as a table while recognizing a clear task workflow', () => {
    const services = Array.from({ length: 6 }, (_, i) => ({ name: `Service ${i}`, status: i % 2 ? 'healthy' : 'down', latency: i }))
    expect(inferJsonViewMetadata({ services }).views.map((view) => view.display)).toEqual([undefined])
    const tasks = services.map((row, i) => ({ ...row, status: i % 2 ? 'In progress' : 'Done' }))
    expect(inferJsonViewMetadata({ tasks }).views.map((view) => view.display)).toEqual([undefined, 'kanban'])
  })
  it('recognizes single-option modes and categorical values with slashes', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ name: `Post ${i}`, send_mode: 'preview_actual', platform: i % 2 ? 'Twitter/X' : 'Reddit', channel: i % 2 ? 'Twitter' : 'r/SaaS' }))
    const schema = inferJsonViewMetadata(rows).schema
    for (const key of ['send_mode', 'platform', 'channel']) expect(schema[`$[*].${key}`]?.type).toBe('select')
    expect(schema['$[*].name']?.type).toBe('text')
  })

  it('offers nested object fields as columns without exploding arrays', () => {
    const people = Array.from({ length: 4 }, (_, i) => ({ name: `Person ${i}`, company: { name: `Company ${i}`, country: i % 2 ? 'UK' : 'US' } }))
    const view = inferJsonViewMetadata({ people }).views[0]
    expect(view?.columns).toContainEqual(expect.objectContaining({ path: '$.people[*].company.name' }))
    expect(view?.columns).toContainEqual(expect.objectContaining({ path: '$.people[*].company.country' }))
  })

  it('shares one normalized title policy with nested record tables', () => {
    expect(inferJsonViewRecordTitleKey([{ id: 'id-1', display_name: 'Display', name: 'Name' }])).toBe('name')
    expect(inferJsonViewRecordTitleKey([{ display_name: 'Display', detail: 'Detail' }])).toBe('display_name')
    expect(inferJsonViewRecordTitleKey([{ count: 1, detail: 'Detail' }])).toBe('detail')
    expect(inferJsonViewRecordTitleKey([{ id: 42, count: 1 }])).toBe('id')
  })
  it('infers typed fields plus table and Kanban views for a record collection', () => {
    const root = {
      contacts: [
        {
          name: 'Ada Lovelace',
          status: 'New',
          score: 92,
          active: true,
          tags: ['Engineering', 'Product'],
          followUp: '2026-09-12',
          website: 'https://example.com/ada',
          email: 'ada@example.com',
          notes: 'A long-form note.\nIt belongs in the body editor.',
        },
        {
          name: 'Grace Hopper',
          status: 'Customer',
          score: 84,
          active: false,
          tags: ['Engineering'],
          followUp: '2026-09-18',
          website: 'https://example.com/grace',
          email: 'grace@example.com',
          notes: 'Another long-form note.\nIt also belongs in the body editor.',
        },
      ],
    }

    root.contacts.push(
      { ...root.contacts[0], name: 'Katherine Johnson', score: 90, email: 'katherine@example.com' },
      { ...root.contacts[1], name: 'Dorothy Vaughan', score: 86, email: 'dorothy@example.com' },
    )
    const inferred = inferJsonViewMetadata(root)
    expect(inferred.schema).toMatchObject({
      '$.contacts[*].name': { type: 'text', title: 'Name' },
      '$.contacts[*].status': { type: 'select', title: 'Status', options: ['New', 'Customer'] },
      '$.contacts[*].score': { type: 'number', title: 'Score' },
      '$.contacts[*].active': { type: 'checkbox', title: 'Active' },
      '$.contacts[*].tags': { type: 'multi-select', title: 'Tags', options: ['Engineering', 'Product'] },
      '$.contacts[*].followUp': { type: 'date', title: 'Follow Up' },
      '$.contacts[*].website': { type: 'url', title: 'Website' },
      '$.contacts[*].email': { type: 'email', title: 'Email' },
      '$.contacts[*].notes': { type: 'text', title: 'Notes' },
    })
    expect(inferred.views).toEqual([
      expect.objectContaining({
        id: 'contacts',
        name: 'Contacts',
        path: '$.contacts',
      }),
      expect.objectContaining({
        id: 'contacts-board',
        name: 'Contacts board',
        path: '$.contacts',
        display: 'kanban',
        groupBy: '$.contacts[*].status',
      }),
    ])
    expect(inferred.views[0].columns).toContainEqual(expect.objectContaining({ path: '$.contacts[*].notes' }))
  })

  it('infers root fields without duplicating the natural layout and finds nested collections', () => {
    const record = inferJsonViewMetadata({
      title: 'Launch plan',
      published: true,
      releaseDate: '2026-09-05T13:30:00Z',
      description: 'This is a deliberately long description that should be edited as a body rather than squeezed into a compact text input. It has enough content to cross the inference threshold.',
    })
    expect(record.views).toEqual([])
    expect(record.schema['$.releaseDate']).toMatchObject({ type: 'date', defaultIncludeTime: true })
    expect(record.schema['$.description']).toMatchObject({ type: 'text' })

    const nested = inferJsonViewMetadata({ response: { results: [{ title: 'One', count: 1 }, { title: 'Two', count: 2 }, { title: 'Three', count: 3 }] } })
    expect(nested.views[0]).toMatchObject({ name: 'Results', path: '$.response.results' })
  })

  it('infers date widgets for floating timezone-less date-times', () => {
    const inferred = inferJsonViewMetadata({
      events: [
        { title: 'Planning', start: '2026-08-17T09:00:00' },
        { title: 'Review', start: '2026-08-18T14:00:00' },
      ],
    })

    expect(inferred.schema['$.events[*].start']).toMatchObject({ type: 'date', title: 'Start', defaultIncludeTime: true })
  })

  it('limits inferred views to two across the whole document', () => {
    const inferred = inferJsonViewMetadata({
      contacts: [{ name: 'Ada', status: 'New' }, { name: 'Grace', status: 'Customer' }, { name: 'Katherine', status: 'New' }],
      tasks: [{ title: 'Ship', priority: 'High' }, { title: 'Review', priority: 'Low' }, { title: 'Test', priority: 'High' }],
      events: [{ title: 'Start' }, { title: 'Finish' }],
    })

    expect(inferred.views).toHaveLength(2)
  })

  it('compiles inferred types without duplicating the root-array table', () => {
    const compiled = compileJsonViewMetadata([
      { name: 'Alpha', state: 'Open' },
      { name: 'Beta', state: 'Done' },
    ])

    expect(compiled.recognized).toBe(false)
    expect(compiled.active).toBe(true)
    expect(compiled.schema.map((entry) => entry.declaration)).toEqual(['$[*].name', '$[*].state'])
    expect(compiled.views).toEqual([])
  })

  it('keeps multiple long properties as text', () => {
    const long = 'A deliberately long value that is useful to read in full and is long enough to qualify for body inference. It continues past the threshold.'
    const root = [
      { fit_reason: long, supporting_evidence: long, notes: long },
      { fit_reason: `${long} One`, supporting_evidence: `${long} Two`, notes: `${long} Three` },
    ]

    const inferred = inferJsonViewMetadata(root)
    expect(inferred.schema['$[*].notes']).toMatchObject({ type: 'text' })
    expect(inferred.schema['$[*].fit_reason']).toMatchObject({ type: 'text' })
    expect(inferred.schema['$[*].supporting_evidence']).toMatchObject({ type: 'text' })

    const compiled = compileJsonViewMetadata(root)
    expect(compiled.diagnostics.filter((item) => item.code === 'duplicate-record-body')).toEqual([])
  })

  it('chooses the longest minimum string length above thirty, ignoring names and outliers', () => {
    const schema = inferJsonViewMetadata([
      { notes: 'short', arbitrary: 'g'.repeat(31), outlier: 'x'.repeat(200), boundary: 'b'.repeat(30) },
      { notes: 'also short', arbitrary: 'g'.repeat(45), outlier: 'tiny', boundary: 'b'.repeat(30) },
    ]).schema
    expect(schema['$[*].arbitrary']?.type).toBe('text')
    expect(schema['$[*].boundary']?.type).toBe('select')
    for (const key of ['notes', 'outlier']) expect(schema[`$[*].${key}`]?.type).toBe('text')
    expect(inferJsonViewMetadata([{ text: 'a'.repeat(80) }, { text: '' }]).schema['$[*].text']?.type).toBe('text')
  })

  it('does not validate source data against sampled inference', () => {
    const root = Array.from({ length: 124 }, (_, index) => ({
      competitor_screened_at: index >= 122 ? '' : '2026-08-20T12:30:00Z',
    }))

    const inferred = compileJsonViewMetadata(root)
    expect(inferred.schema[0]?.descriptor.type).toBe('date')
    expect(inferred.diagnostics).toEqual([])

    const explicit = compileJsonViewMetadata(root, undefined, {
      metadata: { version: 1, schema: { '$[*].competitor_screened_at': { type: 'date' } } },
    })
    expect(explicit.diagnostics.filter((item) => item.code === 'invalid-typed-value')).toHaveLength(2)
  })

  it('never supplements explicit metadata and avoids primitive-only collections', () => {
    const explicit = compileJsonViewMetadata({
      contacts: [{ name: 'Ada' }, { name: 'Grace' }],
      $jsonviews: { version: 1, views: [] },
    })
    expect(explicit.recognized).toBe(true)
    expect(explicit.inference).toBeUndefined()
    expect(explicit.schema).toEqual([])
    expect(explicit.views).toEqual([])

    const primitives = compileJsonViewMetadata([1, 2, 3])
    expect(primitives.active).toBe(false)
    expect(primitives.inference).toBeUndefined()
  })
})
