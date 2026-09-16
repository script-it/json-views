import { describe, expect, it } from 'vitest'
import {
  compileJsonViewMetadata, createDefaultTypeRegistry, inspectCsvSource, inspectJsonSource,
  type JsonViewMetadataDiagnostic,
} from '../src/index.js'

const root = { rows: [{ name: 'Ada', score: 1, status: 'Todo', due: '2026-01-01', position: 1 }] }
const view = (extra: Record<string, unknown> = {}) => ({ name: 'Rows', path: '$.rows', ...extra })
const compile = (metadata: unknown, data: unknown = root) => compileJsonViewMetadata(data, undefined, { metadata })
const issue = (metadata: unknown, code: string, data: unknown = root): JsonViewMetadataDiagnostic => {
  const diagnostic = compile(metadata, data).diagnostics.find((item) => item.code === code)
  expect(diagnostic, code).toBeDefined()
  expect(diagnostic!.help?.fix.length).toBeGreaterThan(15)
  expect(diagnostic!.help?.expected.length).toBeGreaterThan(3)
  expect(diagnostic!.metadataSource).toBe('external')
  return diagnostic!
}

describe('progressive diagnostic help', () => {
  it.each([
    ['invalid-metadata', null],
    ['unsupported-metadata-version', { version: 2 }],
    ['invalid-schema-map', { version: 1, schema: [] }],
    ['invalid-schema-descriptor', { version: 1, schema: { '$.rows': 'text' } }],
    ['invalid-schema-type', { version: 1, schema: { '$.rows': {} } }],
    ['unknown-schema-type', { version: 1, schema: { '$.rows': { type: 'array' } } }],
    ['invalid-schema-path', { version: 1, schema: { '@.name': { type: 'text' } } }],
    ['invalid-views', { version: 1, views: {} }],
    ['invalid-view', { version: 1, views: [null] }],
    ['invalid-view-path', { version: 1, views: [view({ path: '$.rows[*]' })] }],
    ['unresolved-view-path', { version: 1, views: [view({ path: '$.missing' })] }],
    ['invalid-columns', { version: 1, views: [view({ columns: {} })] }],
    ['invalid-column', { version: 1, views: [view({ columns: [{ label: '', path: '$.rows[*].name' }] })] }],
    ['invalid-column-path', { version: 1, views: [view({ columns: [{ label: 'Name', path: '$.elsewhere[*].name' }] })] }],
    ['invalid-filter', { version: 1, views: [view({ filter: { match: 'or', rules: [] } })] }],
    ['invalid-filter-rule', { version: 1, views: [view({ filter: { rules: [{ path: '$.rows[*].name' }] } })] }],
    ['invalid-filter-path', { version: 1, views: [view({ filter: { rules: [{ path: '@.name', operator: 'eq', value: 1 }] } })] }],
    ['invalid-filter-value', { version: 1, views: [view({ filter: { rules: [{ path: '$.rows[*].name', operator: 'in', value: 'Ada' }] } })] }],
    ['invalid-sort', { version: 1, views: [view({ sort: {} })] }],
    ['invalid-sort-entry', { version: 1, views: [view({ sort: [{ path: '$.rows[*].name', direction: 'up' }] })] }],
    ['invalid-sort-path', { version: 1, views: [view({ sort: [{ path: '@.name', direction: 'asc' }] })] }],
    ['removed-view-title', { version: 1, views: [view({ title: 'My title' })] }],
    ['invalid-group-path', { version: 1, views: [view({ display: 'kanban', groupBy: '@.status' })] }],
    ['invalid-group-order', { version: 1, views: [view({ display: 'kanban', groupBy: '$.rows[*].status', groupOrder: ['Todo', { status: 'Done' }] })] }],
    ['invalid-order-path', { version: 1, views: [view({ display: 'kanban', groupBy: '$.rows[*].status', orderPath: '@.position' })] }],
    ['incompatible-view', { version: 1, views: [view({ path: '$.rows[0]', columns: [{ label: 'Name', path: '$.rows[*].name' }] })] }],
    ['invalid-display', { version: 1, views: [view({ display: 'page' })] }],
    ['incompatible-kanban', { version: 1, views: [view({ display: 'kanban' })] }],
    ['invalid-display', { version: 1, views: [view({ display: 'table' })] }],
    ['conflicting-kanban-paths', { version: 1, views: [view({ display: 'kanban', groupBy: '$.rows[*].status', orderPath: '$.rows[*].status' })] }],
  ])('explains %s at the point it becomes relevant', (code, metadata) => {
    const result = issue(metadata, code as string)
    expect(result.help).toHaveProperty('received')
    expect(JSON.stringify(result.help)).not.toContain('undefined')
  })

  it.each([
    ['title', 1], ['description', false], ['required', 'true'], ['nullable', false],
    ['minimum', 'zero'], ['maximum', {}], ['defaultIncludeTime', 'yes'],
    ['pattern', '(?=x)'], ['options', [{ label: 'Todo', value: 'todo' }]],
    ['optionColors', { Todo: '#00ff00' }], ['placeholder', []], ['multiline', 'yes'], ['step', 0],
  ])('provides property-specific capabilities for %s', (property, value) => {
    const type = property === 'optionColors' || property === 'options' ? 'select' : 'number'
    const metadata = { version: 1, schema: { '$.rows[*].score': { type, [property]: value } } }
    const diagnostics = compile(metadata).diagnostics.filter((item) => item.scope === 'schema' && item.severity !== 'warning')
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.every((item) => item.help?.fix && item.help.expected && item.help.capabilities?.length)).toBe(true)
  })

  it('uses normalized constraints when malformed properties coexist with invalid data', () => {
    const result = issue({ version: 1, schema: { '$.x': { type: 'select', options: {}, pattern: '[', required: 'yes' } } }, 'invalid-typed-value', { x: 42 })
    expect(result.help?.expected).toContain('one JSON string')
    expect(result.help?.received).toBe('42')
    expect(result.help?.capabilities?.join(' ')).not.toContain('Active pattern')
    expect(result.help?.capabilities?.join(' ')).toContain('optional')
  })

  it('reports independent view syntax errors even when its name and root path are invalid', () => {
    const diagnostics = compile({ version: 1, views: [view({ name: '', path: '@.rows', columns: {}, filter: [], sort: {}, display: 'table', title: '@.name' })] }).diagnostics
    expect(diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'invalid-view', 'invalid-view-path', 'invalid-columns', 'invalid-filter', 'invalid-sort', 'invalid-display', 'removed-view-title',
    ]))
    expect(diagnostics.find((item) => item.code === 'invalid-view')?.metadataPath).toEqual(['$jsonviews', 'views', 0, 'name'])
  })

  it('reports sibling errors inside columns, rules, and sort entries together', () => {
    const diagnostics = compile({ version: 1, views: [view({
      columns: [{ label: '', path: '@.name' }],
      filter: { match: 'or', rules: [{ path: '@.name', operator: '', value: 1 }] },
      sort: [{ path: '@.name', direction: 'up' }],
    })] }).diagnostics
    expect(diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'invalid-column', 'invalid-column-path', 'invalid-filter', 'invalid-filter-rule', 'invalid-filter-path', 'invalid-sort-entry', 'invalid-sort-path',
    ]))
    expect(diagnostics.find((item) => item.code === 'invalid-filter')?.metadataPath).toEqual(['$jsonviews', 'views', 0, 'filter', 'match'])
  })

  it('suggests existing fields when a syntactically valid field path selects nothing', () => {
    const diagnostic = issue({ version: 1, views: [view({ columns: [{ label: 'Name', path: '$.rows[*].naem' }] })] }, 'invalid-column-path')
    expect(diagnostic.help?.examples).toContain('$.rows[*].name')
    expect(compile({ version: 1, views: [view({ columns: [{ label: 'Name', path: '$.rows[*].name' }] })] }).diagnostics).toEqual([])
  })

  it('reports ignored properties at every nested level without discarding a valid view', () => {
    const metadata = { version: 1, scheam: {}, schema: { '$.rows[*].name': { type: 'text', default: 'Ada' } }, views: [view({
      groupby: '$.rows[*].status',
      columns: [{ label: 'Name', path: '$.rows[*].name', width: 200 }],
      filter: { mode: 'any', rules: [{ path: '$.rows[*].name', operator: 'isNotEmpty', value: true, negate: true }] },
      sort: [{ path: '$.rows[*].name', direction: 'asc', order: 1 }],
    })] }
    const compiled = compile(metadata)
    expect(compiled.views).toHaveLength(1)
    expect(compiled.diagnostics).toHaveLength(8)
    expect(compiled.diagnostics.every((item) => item.severity === 'warning')).toBe(true)
    expect(compiled.schema[0].descriptor.default).toBe('Ada')
    expect(compiled.diagnostics.find((item) => item.metadataPath.at(-1) === 'groupby')?.message).toContain('groupBy')
    expect(compiled.diagnostics.find((item) => item.metadataPath.at(-1) === 'width')?.help?.allowedValues).toEqual(['label', 'path'])
  })

  it('uses the live host registry for types, properties, and operator help', () => {
    const registry = createDefaultTypeRegistry().register({ name: 'rating', validate: () => undefined, filterOperators: ['near'], descriptorProperties: ['type', 'maxStars'] })
    const custom = compileJsonViewMetadata(root, registry, { metadata: { version: 1, schema: { '$.rows[*].score': { type: 'rating', maxStars: 5 } }, views: [view({ filter: { rules: [{ path: '$.rows[*].score', operator: 'gt', value: 3 }] } })] } })
    expect(custom.diagnostics).toHaveLength(1)
    expect(custom.diagnostics[0].metadataPath).toEqual(['$jsonviews', 'views', 0, 'filter', 'rules', 0, 'operator'])
    expect(custom.diagnostics[0].help?.allowedValues).toEqual(['near'])
    const unknown = compileJsonViewMetadata(root, registry, { metadata: { version: 1, schema: { '$.x': { type: 'missing' } } } })
    expect(unknown.diagnostics[0].help?.allowedValues).toContain('rating')
    registry.register({ name: 'open', validate: () => undefined })
    expect(compileJsonViewMetadata(root, registry, { metadata: { version: 1, schema: { '$.rows[*].score': { type: 'open', anything: true } } } }).diagnostics).toEqual([])
  })

  it('points failing extension hooks at the host and handles prototype-like type names', () => {
    const registry = createDefaultTypeRegistry()
      .register({ name: 'broken', validate: () => { throw new Error('validator bug') } })
      .register({ name: 'constructor', descriptorProperties: ['type'], validate: () => 'Expected custom value' })
    const compiled = compileJsonViewMetadata({ x: 1, y: 2 }, registry, { metadata: { version: 1, schema: { '$.x': { type: 'broken' }, '$.y': { type: 'constructor' } } } })
    expect(compiled.diagnostics[0].help?.fix).toContain('validate hook in the host registration')
    expect(compiled.diagnostics[1].help?.expected).toContain('registered type "constructor"')
  })

  it('does not confuse a malformed schema key with a descriptor property', () => {
    const result = issue({ version: 1, schema: { options: { type: 'text' } } }, 'invalid-schema-path')
    expect(result.help?.fix).toContain('Rename this schema map key')
  })

  it('gives the operator intersection for heterogeneous fields', () => {
    const registry = createDefaultTypeRegistry().register({ name: 'custom', validate: () => undefined, filterOperators: ['near'] })
    const compiled = compileJsonViewMetadata({ rows: [{ x: 1 }, { x: 2 }] }, registry, { metadata: {
      version: 1, schema: { '$.rows[0].x': { type: 'custom' }, '$.rows[1].x': { type: 'number' } },
      views: [view({ filter: { rules: [{ path: '$.rows[*].x', operator: 'near', value: 1 }] } })],
    } })
    expect(compiled.diagnostics[0].help?.allowedValues).toEqual([])
  })

  it('validates date filter operands without applying field bounds to the query', () => {
    const metadata = (value: unknown) => ({ version: 1, schema: { '$.rows[*].due': { type: 'date', minimum: '2025-01-01' } }, views: [view({ filter: { rules: [{ path: '$.rows[*].due', operator: 'gte', value }] } })] })
    const diagnostic = issue(metadata('2026-02-30'), 'invalid-filter-value')
    expect(diagnostic.help?.examples).toEqual(['2026-01-01', '2026-01-01T09:30:00Z'])
    expect(compile(metadata('2020-01-01')).diagnostics).toEqual([])
  })

  it('identifies every invalid rank at its exact field path', () => {
    const diagnostics = compile({ version: 1, views: [view({ display: 'kanban', groupBy: '$.rows[*].status', orderPath: '$.rows[*].position' })] }, { rows: [{ status: 'A', position: '1' }, { status: 'A' }, { status: 'A', position: 3 }] }).diagnostics
    const ranks = diagnostics.filter((item) => item.code === 'invalid-order-value')
    expect(ranks.map((item) => item.sourcePath)).toEqual([['rows', 0, 'position'], ['rows', 1, 'position']])
    expect(ranks.map((item) => item.help?.received)).toEqual(['"1"', 'missing'])
  })

  it('distinguishes a missing required ancestor from a leaf value', () => {
    const metadata = { version: 1, schema: { '$.rows[*].name': { type: 'text', required: true } } }
    const result = issue(metadata, 'required-value-missing', {})
    expect(result.sourcePath).toEqual(['rows'])
    expect(result.help?.fix).toContain('Do not replace the container with a leaf value')
    expect(compile(metadata, { rows: [] }).diagnostics).toEqual([])
    expect(compile(metadata, { rows: [{ name: 'Ada' }] }).diagnostics).toEqual([])
  })

  it('provides only examples that satisfy the active constraints', () => {
    const result = issue({ version: 1, schema: { '$.x': { type: 'number', minimum: 10, maximum: 20, required: true } } }, 'invalid-typed-value', { x: '12' })
    expect(result.help?.examples).toEqual([10, 20])
    expect(result.help?.capabilities).toContain('Active minimum: 10.')
  })

  it('keeps valid documents quiet and warnings repairable without data coercion', () => {
    const schema = { '$.rows[*].status': { type: 'select', options: ['Done'] } }
    expect(compile({ version: 1, schema, views: [view()] }).diagnostics).toEqual([])
    const invalid = issue({ version: 1, views: [view({ display: 'table' })] }, 'invalid-display')
    expect(invalid.help?.fix).toContain('Remove display')
    expect(compile({ version: 1, views: [view()] }).views).toHaveLength(1)
    const registry = createDefaultTypeRegistry().register({ name: 'reviewed', validate: () => undefined, warnings: () => ['Needs review'] })
    const warning = compileJsonViewMetadata({ x: 'value' }, registry, { metadata: { version: 1, schema: { '$.x': { type: 'reviewed' } } } }).diagnostics[0]
    expect(warning.help?.fix).toContain('Preserve the intended value')
  })

  it('bounds previews and preserves exact unsafe source tokens through the source API', () => {
    const result = issue({ version: 1, schema: { '$.x': { type: 'number' } } }, 'invalid-typed-value', { x: 'x'.repeat(100_000) })
    expect(result.help?.received?.length).toBeLessThan(200)
    const source = '{"id":9007199254740993,"x":1,"x":2}'
    const diagnostics = inspectJsonSource(source).diagnostics
    expect(diagnostics.every((item) => item.help?.fix && item.help.expected)).toBe(true)
    expect(diagnostics.find((item) => item.code === 'unsafe-number')?.token).toBe('9007199254740993')
    expect(inspectCsvSource('a,b\n1\n').diagnostics[0].help?.expected).toBe('one cell per header column')
  })
})
