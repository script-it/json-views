import { describe, expect, it } from 'vitest'

import { compileJsonViewMetadata } from '../src/metadata'
import {
  applyJsonViewViewRows,
  matchesJsonViewFilterRule,
  projectJsonViewCollection,
} from '../src/view-model'

describe('Script.it JSON view model', () => {
  const root = {
    rows: [
      { name: 'Low', score: 20, status: 'new', owner: { email: 'low@example.com' }, tags: ['a'] },
      { name: 'High', score: 90, status: 'qualified', owner: { email: 'high@example.com' }, tags: ['a', 'b'] },
      { name: 'Mid', score: 70, status: 'qualified', owner: {} },
    ],
    $jsonviews: {
      version: 1,
      schema: {
        '$.rows[*].notes': { type: 'body' },
      },
      views: [{
        id: 'priority',
        name: 'Priority',
        path: '$.rows',
        columns: [
          { label: 'Lead', path: '$.rows[*].name' },
          { label: 'Owner', path: '$.rows[*].owner.email' },
          { label: 'Lead', path: '$.rows[*].score' },
        ],
        filter: { match: 'all', rules: [{ path: '$.rows[*].score', operator: 'gte', value: 70 }] },
        sort: [{ path: '$.rows[*].score', direction: 'desc' }],
      }],
    },
  }

  it('filters and stably sorts rows while retaining exact source paths', () => {
    const compiled = compileJsonViewMetadata(root)
    const rows = applyJsonViewViewRows(root, compiled.views[0])

    expect(rows.map((row) => row.value.name)).toEqual(['High', 'Mid'])
    expect(rows.map((row) => row.sourcePath)).toEqual([['rows', 1], ['rows', 2]])
  })

  it('projects nested columns, missing cells, and duplicate labels safely', () => {
    const compiled = compileJsonViewMetadata(root)
    const projected = projectJsonViewCollection(root, compiled.views[0])

    expect(projected.columns.map(({ id, label }) => [id, label])).toEqual([
      ['column-0', 'Lead'],
      ['column-1', 'Owner'],
      ['column-2', 'Lead'],
    ])
    expect(projected.records).toEqual([
      { 'column-0': 'High', 'column-1': 'high@example.com', 'column-2': 90 },
      { 'column-0': 'Mid', 'column-2': 70 },
    ])
  })

  it('uses typed filter semantics for presence, membership, and contains', () => {
    const rule = (operator: 'isEmpty' | 'in' | 'contains', value?: unknown) => ({
      operator,
      path: { source: '$.rows[*].value', root: '$' as const, segments: [{ kind: 'property' as const, key: 'rows' }, { kind: 'wildcard' as const }, { kind: 'property' as const, key: 'value' }] },
      metadataPath: [],
      ...(value === undefined ? {} : { value }),
    })
    expect(matchesJsonViewFilterRule('', rule('isEmpty'))).toBe(true)
    expect(matchesJsonViewFilterRule('qualified', rule('in', ['new', 'qualified']))).toBe(true)
    expect(matchesJsonViewFilterRule('Hello Script.it', rule('contains', 'script'))).toBe(true)
  })


  it('uses date-aware filtering and sorting while keeping invalid values last', () => {
    const dated = {
      rows: [
        { name: 'Later instant', due: '2026-09-04T15:30:00Z' },
        { name: 'Calendar date', due: '2026-09-04' },
        { name: 'Earlier instant', due: '2026-09-04T16:00:00+03:00' },
        { name: 'Invalid', due: 'tomorrow' },
        { name: 'Missing' },
      ],
      $jsonviews: {
        version: 1,
        schema: { '$.rows[*].due': { type: 'date' } },
        views: [{
          id: 'dates',
          name: 'Dates',
          path: '$.rows',
          filter: { rules: [{ path: '$.rows[*].due', operator: 'eq', value: '2026-09-04' }] },
          sort: [{ path: '$.rows[*].due', direction: 'asc' }],
        }],
      },
    }
    const compiled = compileJsonViewMetadata(dated)
    const rows = applyJsonViewViewRows(dated, compiled.views[0], compiled.schema)

    expect(rows.map((row) => row.value.name)).toEqual(['Calendar date', 'Earlier instant', 'Later instant'])
  })
})
