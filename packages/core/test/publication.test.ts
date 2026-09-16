import { describe, expect, it, vi } from 'vitest'
import {
  applyJsonViewViewRows,
  schemaForJsonViewPath,
  compareDateValues,
  compileJsonViewMetadata,
  createDefaultTypeRegistry,
  getJsonViewViewRows,
  inspectJsonSource,
  matchesDateFilter,
  matchesJsonViewFilterRule,
  parseJsonViewPath,
  projectJsonViewCollection,
  replaceJsonValueInSource,
  replaceJsonValuesInSource,
  resolveJsonViewRowPath,
  setJsonValueAtPath,
  stringifyJsonValue,
  upsertJsonObjectPropertyInSource,
  validateJsonViewSchemaValue,
} from '../src/index.js'

const annotated = (schema: unknown, data: Record<string, unknown> = {}) => ({
  ...data, $jsonviews: { version: 1, schema },
})

describe('annotation compilation and validation boundaries', () => {
  it('drops invalid known fields while retaining extensible JSON descriptor data', () => {
    const compiled = compileJsonViewMetadata(annotated({
      '$.x': {
        type: 'select', options: {}, required: 'false', pattern: '[', minimum: {},
        title: {}, description: [], placeholder: false, multiline: 'yes', step: -1,
        optionColors: { existing: 'green', invalid: 'teal' },
        extension: { swatch: 'green' },
      },
    }, { x: 'existing' }))
    expect(compiled.schema[0].descriptor).toEqual({
      type: 'select', options: ['existing'], optionColors: { existing: 'green' }, extension: { swatch: 'green' },
    })
    expect(compiled.diagnostics.filter((issue) => issue.scope === 'schema' && issue.severity !== 'warning').map((issue) => issue.code).sort()).toEqual([
      'invalid-title', 'invalid-description', 'invalid-required', 'invalid-minimum', 'invalid-pattern',
      'invalid-options', 'invalid-option-color', 'invalid-placeholder', 'invalid-multiline', 'invalid-step',
    ].sort())
    expect(validateJsonViewSchemaValue('existing', compiled.schema[0].descriptor)).toBeUndefined()
    expect(compileJsonViewMetadata(annotated({ '$.x': { type: 'text', required: 'false' } })).diagnostics)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ scope: 'value' })]))
  })

  it('uses exactly the same pattern constraint for document and editor validation', () => {
    const compiled = compileJsonViewMetadata(annotated({ '$.x': { type: 'text', pattern: '^[0-9]+$' } }, { x: 'abc' }))
    const issue = validateJsonViewSchemaValue('abc', compiled.schema[0].descriptor)
    expect(issue).toBe('Value does not match the required pattern')
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ scope: 'value', message: issue, sourcePath: ['x'] }))
  })

  it('matches nested quantifiers using a linear-time engine and rejects unsupported syntax', () => {
    expect(validateJsonViewSchemaValue('a'.repeat(100_000) + '!', { type: 'text', pattern: '^(a+)+$' }))
      .toBe('Value does not match the required pattern')
    for (const pattern of ['[', '(a)\\1', '(?=a)a', 'x'.repeat(4097)]) {
      const compiled = compileJsonViewMetadata(annotated({ '$.x': { type: 'text', pattern } }, { x: 'abc' }))
      expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-pattern' }))
      expect(compiled.schema[0].descriptor.pattern).toBeUndefined()
    }
  }, 2000)

  it('reports every required leaf when an intermediate record is absent, null, or scalar', () => {
    const compiled = compileJsonViewMetadata(annotated({ '$.rows[*].profile.name': { type: 'text', required: true } }, {
      rows: [{}, { profile: null }, { profile: {} }, { profile: 4 }, { profile: { name: 'present' } }],
    }))
    expect(compiled.diagnostics.filter((issue) => issue.scope === 'value').map((issue) => issue.sourcePath))
      .toEqual([0, 1, 2, 3].map((index) => ['rows', index, 'profile', 'name']))
    const empty = compileJsonViewMetadata(annotated({ '$.rows[*].name': { type: 'text', required: true } }, { rows: [] }))
    expect(empty.diagnostics).toEqual([])
    const missing = compileJsonViewMetadata(annotated({ '$.rows[*].name': { type: 'text', required: true } }))
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ sourcePath: ['rows'], code: 'required-value-missing' }))
  })

  it('retains unknown versions and disables annotation compilation with explicit diagnostics', () => {
    const metadata = { version: 99, schema: { '$.x': { type: 'future' } }, other: true }
    const compiled = compileJsonViewMetadata({ x: 1, $jsonviews: metadata })
    expect(compiled).toMatchObject({ metadata, metadataSource: 'embedded', status: 'unsupported-version', active: false, schema: [] })
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-metadata-version' }))
    expect(compiled.metadata).toBe(metadata)
    for (const metadata of [null, [], false, { version: '1' }, { schema: {} }]) {
      expect(compileJsonViewMetadata({ $jsonviews: metadata }).status).toBe('invalid')
    }
  })

  it('uses explicit external annotations without inserting metadata into the document', () => {
    const value = [{ score: 2 }]
    const metadata = { version: 1, schema: { '$[*].score': { type: 'number', minimum: 3 } } }
    const compiled = compileJsonViewMetadata(value, undefined, { metadata })
    expect(compiled).toMatchObject({ metadata, metadataSource: 'external', status: 'ready' })
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ scope: 'value', sourcePath: [0, 'score'] }))
    expect(value).toEqual([{ score: 2 }])
    expect(compileJsonViewMetadata({ x: 1, $jsonviews: { version: 1 } }, undefined, { metadata: null }).status).toBe('invalid')
  })

  it('isolates custom descriptor and value validation failures into diagnostics', () => {
    const registry = createDefaultTypeRegistry().register({
      name: 'rating',
      validateDescriptor: () => { throw new Error('Invalid configuration') },
      validate: () => undefined,
    })
    const compiled = compileJsonViewMetadata(annotated({ '$.x': { type: 'rating' } }, { x: 5 }), registry)
    expect(compiled.schema).toEqual([])
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-type-descriptor', message: 'Descriptor validator failed: Invalid configuration' }))
    registry.register({ name: 'rating', validate: () => { throw new Error('Bad value') } })
    expect(compileJsonViewMetadata(annotated({ '$.x': { type: 'rating' } }, { x: 5 }), registry).diagnostics)
      .toContainEqual(expect.objectContaining({ scope: 'value', message: 'Validation failed: Bad value' }))
  })
})

describe('extension contracts and current-document plans', () => {
  it('uses custom object values, editor conversions, descriptors, and operators throughout projection', () => {
    const registry = createDefaultTypeRegistry().register({
      name: 'point',
      validateDescriptor: (descriptor) => typeof descriptor.radius === 'number' ? undefined : 'radius must be numeric',
      parse: (value) => (value as { x: number }).x,
      serialize: (value) => ({ x: Number(value) }),
      validate: (value) => typeof (value as { x: unknown })?.x === 'number' ? undefined : 'Expected a point',
      filterOperators: ['near'],
      matchesFilter: (value, operator, expected) => operator === 'near'
        ? Math.abs((value as { x: number }).x - Number(expected)) < 2 : undefined,
      compare: (left, right, direction) => ((left as { x: number }).x - (right as { x: number }).x) * (direction === 'asc' ? 1 : -1),
    })
    const data = {
      rows: [{ point: { x: 2 } }, { point: { x: 8 } }, { point: { x: 3 } }],
      $jsonviews: { version: 1, schema: { '$.rows[*].point': { type: 'point', radius: 2 } }, views: [{
        name: 'Nearby', path: '$.rows', filter: { rules: [{ path: "$['rows'][*]['point']", operator: 'near', value: 3 }] },
        sort: [{ path: '$.rows[*].point', direction: 'desc' }],
      }] },
    }
    const compiled = compileJsonViewMetadata(data, registry)
    expect(compiled.diagnostics).toEqual([])
    expect(projectJsonViewCollection(data, compiled.views[0], compiled.schema, registry).records)
      .toEqual([{ 'column-0': { x: 3 } }, { 'column-0': { x: 2 } }])
    const descriptor = compiled.schema[0].descriptor
    expect(registry.parse({ x: 3 }, descriptor)).toBe(3)
    const persisted = registry.serialize('4', descriptor)
    expect(validateJsonViewSchemaValue(persisted, descriptor, registry)).toBeUndefined()
    expect(persisted).toEqual({ x: 4 })
  })

  it('notifies registry subscribers and snapshots registration definitions', () => {
    const registry = createDefaultTypeRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)
    const before = registry.version
    const operators = ['near']
    registry.register({ name: 'point', validate: () => undefined, filterOperators: operators })
    operators.push('unexpected')
    expect(registry.filterOperators({ type: 'point' })).toEqual(['near'])
    registry.unregister('point')
    expect(registry.version).toBe(before + 2)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    registry.unregister('number')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('resolves reused view and row plans against the supplied current root', () => {
    const original = { rows: [{ name: 'before' }], $jsonviews: { version: 1, views: [{ name: 'Rows', path: '$.rows' }] } }
    const compiled = compileJsonViewMetadata(original)
    const [originalRow] = getJsonViewViewRows(compiled.views[0])
    const updated = { ...original, rows: [{ name: 'after' }, { name: 'second' }] }
    expect(applyJsonViewViewRows(updated, compiled.views[0]).map((row) => row.value.name)).toEqual(['after', 'second'])
    expect(getJsonViewViewRows(compiled.views[0], updated)).toHaveLength(2)
    expect(resolveJsonViewRowPath(updated, originalRow, parseJsonViewPath('$.rows[*].name', { allowWildcard: true })).value).toBe('after')
  })

  it('normalizes legacy annotations while preserving path precedence', () => {
    for (const rows of [[{ notes: 'n', description: 'd' }, { notes: 'n' }], { first: { notes: 'n', description: 'd' }, second: { notes: 'n' } }]) {
      const first = Array.isArray(rows) ? 0 : 'first'
      const second = Array.isArray(rows) ? 1 : 'second'
      const concrete = Array.isArray(rows) ? '[0]' : '.first'
      const compiled = compileJsonViewMetadata(annotated({
        '$.rows[*].notes': { type: 'body' },
        [`$.rows${concrete}.notes`]: { type: 'text' },
        [`$.rows${concrete}.description`]: { type: 'body' },
      }, { rows }))
      expect(schemaForJsonViewPath(compiled.schema, ['rows', first, 'notes'])?.descriptor).toEqual({ type: 'text' })
      expect(schemaForJsonViewPath(compiled.schema, ['rows', first, 'description'])?.descriptor).toEqual({ type: 'markdown' })
      expect(schemaForJsonViewPath(compiled.schema, ['rows', second, 'notes'])?.descriptor).toEqual({ type: 'markdown' })
    }
    const conflict = compileJsonViewMetadata(annotated({
      '$.rows[*].one': { type: 'text', title: 'A' }, '$.rows.a[*]': { type: 'text', title: 'B' },
    }, { rows: { a: { one: 'x' } } }))
    expect(conflict.diagnostics).toContainEqual(expect.objectContaining({ code: 'schema-specificity-conflict' }))
  })

  it('uses one comparator for a column with mixed type overrides', () => {
    const registry = createDefaultTypeRegistry().register({ name: 'reverse-number', validate: () => undefined,
      compare: (left, right) => Number(right) - Number(left) })
    const root = { rows: [{ score: 1 }, { score: 2 }], $jsonviews: { version: 1,
      schema: { '$.rows[*].score': { type: 'number' }, '$.rows[1].score': { type: 'reverse-number' } },
      views: [{ name: 'Rows', path: '$.rows', sort: [{ path: '$.rows[*].score', direction: 'asc' }] }],
    } }
    const compiled = compileJsonViewMetadata(root, registry)
    expect(applyJsonViewViewRows(root, compiled.views[0], compiled.schema, registry).map((row) => row.value.score)).toEqual([1, 2])
  })

  it('requires a custom filter operator to be supported by every applicable field type', () => {
    const registry = createDefaultTypeRegistry().register({ name: 'rating', validate: () => undefined,
      filterOperators: ['near'], matchesFilter: () => true })
    const root = { rows: [{ score: 1 }, { score: 2 }], $jsonviews: { version: 1,
      schema: { '$.rows[*].score': { type: 'number' }, '$.rows[1].score': { type: 'rating' } },
      views: [{ name: 'Rows', path: '$.rows', filter: { rules: [{ path: '$.rows[*].score', operator: 'near', value: 2 }] } }],
    } }
    const compiled = compileJsonViewMetadata(root, registry)
    expect(compiled.views).toEqual([])
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-filter-operator' }))
  })

  it('never interprets an unknown operator as an ordering operation', () => {
    expect(matchesJsonViewFilterRule(1, { operator: 'unknown', path: parseJsonViewPath('$'), value: 5, metadataPath: [] })).toBe(false)
  })
})

describe('date comparison and filter laws', () => {
  const values = [
    '2026-01-01', '2026-01-02', '2026-01-02T01:00:00+14:00', '2026-01-01T23:00:00-12:00',
    '2026-01-02T00:00:00', '2026-01-02T00:00:00Z', '2026-01-02T01:00:00+01:00',
    '2026-01-02T00:00:00.01Z', '2026-01-02T00:00:00.0100Z', null, 'invalid',
  ]
  it('is reflexive, antisymmetric, and transitive across calendar, floating, and zoned values', () => {
    for (const direction of ['asc', 'desc'] as const) for (const a of values) {
      expect(compareDateValues(a, a, direction)).toBe(0)
      for (const b of values) {
        const ab = Math.sign(compareDateValues(a, b, direction))
        const ba = Math.sign(compareDateValues(b, a, direction))
        expect(ab + ba).toBe(0)
        for (const c of values) if (ab <= 0 && compareDateValues(b, c, direction) <= 0) {
          expect(compareDateValues(a, c, direction)).toBeLessThanOrEqual(0)
        }
      }
    }
  })
  it('validates mixed calendar-day and instant bounds in their own comparison domains', () => {
    const root = annotated({ '$.due': { type: 'date', minimum: '2026-01-02', maximum: '2026-01-02T00:00:00+14:00' } }, {
      due: '2026-01-02T00:00:00+14:00',
    })
    expect(compileJsonViewMetadata(root).diagnostics).toEqual([])
  })
  it('uses calendar-day equality consistently for all date-only filter operators', () => {
    for (const value of ['2026-01-02', '2026-01-02T00:00:00+14:00', '2026-01-02T23:59:59-12:00']) {
      for (const operator of ['eq', 'gte', 'lte']) expect(matchesDateFilter(value, operator, '2026-01-02')).toBe(true)
      for (const operator of ['neq', 'gt', 'lt']) expect(matchesDateFilter(value, operator, '2026-01-02')).toBe(false)
    }
  })
})

describe('JSON data and source integrity', () => {
  it('creates prototype-sensitive keys as own data without altering Object.prototype', () => {
    const row = {}
    setJsonValueAtPath(row, ['__proto__', 'publicationProbe'], '')
    setJsonValueAtPath(row, ['constructor', 'prototype', 'publicationProbe'], 'data')
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'publicationProbe')).toBe(false)
    expect(JSON.parse(JSON.stringify(row))).toEqual(JSON.parse('{"__proto__":{"publicationProbe":""},"constructor":{"prototype":{"publicationProbe":"data"}}}'))
    expect(() => setJsonValueAtPath({}, ['items', 100_000_000], 'x')).toThrow(/consecutive index/)
  })

  it('rejects lossy or effectful values instead of coercing them during replacement', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    const getter = vi.fn(() => 1)
    const toJSON = vi.fn(() => ({ silently: 'changed' }))
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter })
    for (const value of [NaN, Infinity, { a: undefined }, { a: Infinity }, [undefined], [,,], cyclic, accessor, { toJSON }, new Date(), 1n]) {
      expect(() => replaceJsonValueInSource('{"x":1}', ['x'], value)).toThrow(/valid JSON/)
    }
    expect(getter).not.toHaveBeenCalled()
    expect(toJSON).not.toHaveBeenCalled()
    expect(upsertJsonObjectPropertyInSource('{"x":1}', [], 'x', -0)).toBe('{"x":-0}')
    expect(stringifyJsonValue({ point: -0, shared: [true, null] })).toBe('{"point":-0,"shared":[true,null]}')
  })

  it('reports unsafe numeric lexemes and duplicate keys without changing the source', () => {
    const source = '{"id":9007199254740993,"huge":1e400,"minusZero":-0,"tiny":1e-400,"rounded":0.12345678901234567890,"same":1,"same":2,"safe":1.0e+2}'
    const inspected = inspectJsonSource(source)
    expect(inspected.diagnostics.map((issue) => [issue.code, issue.sourcePath])).toEqual([
      ['unsafe-number', ['id']], ['unsafe-number', ['huge']], ['unsafe-number', ['minusZero']],
      ['unsafe-number', ['tiny']], ['unsafe-number', ['rounded']], ['duplicate-key', ['same']],
    ])
    expect(inspected.diagnostics[0].token).toBe('9007199254740993')
    expect(replaceJsonValueInSource(source, ['safe'], 101)).toBe(source.replace('1.0e+2', '101'))
  })

  it('marks shadowed numeric diagnostics without discarding source protection evidence', () => {
    const inspected = inspectJsonSource('{"a":9007199254740993,"a":1}')
    expect(inspected.value).toEqual({ a: 1 })
    expect(inspected.diagnostics).toEqual([
      expect.objectContaining({ code: 'unsafe-number', sourcePath: ['a'], token: '9007199254740993', shadowed: true }),
      expect.objectContaining({ code: 'duplicate-key', sourcePath: ['a'] }),
    ])
    expect(inspected.diagnostics.filter((issue) => issue.code === 'unsafe-number' && !issue.shadowed)).toEqual([])
    const reverse = inspectJsonSource('{"a":1,"a":9007199254740993}')
    expect(reverse.diagnostics.find((issue) => issue.code === 'unsafe-number')?.shadowed).toBeUndefined()
  })

  it('propagates shadowed duplicate ancestors through objects and arrays', () => {
    const inspected = inspectJsonSource('{"record":{"items":[{"n":9007199254740993}],"d":1,"d":2},"record":{"items":[{"n":1}]}}')
    expect(inspected.value).toEqual({ record: { items: [{ n: 1 }] } })
    expect(inspected.diagnostics).toEqual([
      expect.objectContaining({ code: 'unsafe-number', sourcePath: ['record', 'items', 0, 'n'], shadowed: true }),
      expect.objectContaining({ code: 'duplicate-key', sourcePath: ['record', 'd'], shadowed: true }),
      expect.objectContaining({ code: 'duplicate-key', sourcePath: ['record'] }),
    ])
    const reverse = inspectJsonSource('{"record":{"n":1},"record":{"n":9007199254740993}}')
    expect(reverse.diagnostics.find((issue) => issue.code === 'unsafe-number')?.shadowed).toBeUndefined()
  })

  it('resolves a thousand independent replacements with one document parse and source scan', () => {
    const rows = Array.from({ length: 10_000 }, (_, id) => ({ id, order: id }))
    const source = JSON.stringify({ rows })
    const parse = vi.spyOn(JSON, 'parse')
    const patched = replaceJsonValuesInSource(source, Array.from({ length: 1000 }, (_, index) => ({ path: ['rows', index, 'order'], value: 10_000 - index })))
    expect(parse.mock.calls.filter(([input]) => input === source)).toHaveLength(1)
    // Every key token is scanned once, independent of the replacement count.
    expect(parse.mock.calls.length).toBeLessThanOrEqual(21_000)
    parse.mockRestore()
    const result: { rows: { id: number; order: number }[] } = JSON.parse(patched)
    expect(result.rows[0].order).toBe(10_000)
    expect(result.rows[999].order).toBe(9001)
    expect(result.rows[1000].order).toBe(1000)
  })
})
