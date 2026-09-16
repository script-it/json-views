import { readFileSync } from 'node:fs'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { compileJsonViewMetadata, createDefaultTypeRegistry } from '../src/index.js'

interface AnnotationCase { name: string; metadata: unknown; source: unknown; valid: boolean; code?: string }
const cases: AnnotationCase[] = JSON.parse(readFileSync(new URL('./fixtures/annotation-conformance.json', import.meta.url), 'utf8'))
const schema = JSON.parse(readFileSync(new URL('../schema/jsonviews.schema.json', import.meta.url), 'utf8'))
const validate = new Ajv({ strict: false }).compile(schema)
const registry = createDefaultTypeRegistry().register({
  name: 'rating',
  validateDescriptor: (descriptor) => typeof descriptor.maxStars === 'number' ? undefined : 'maxStars must be numeric',
  validate: (value, descriptor) => typeof value === 'number' && value <= Number(descriptor.maxStars) ? undefined : 'Invalid rating',
  filterOperators: ['near'],
  matchesFilter: (value, operator, expected) => operator === 'near' ? Math.abs(Number(value) - Number(expected)) <= 1 : undefined,
})

describe('version 1 annotation schema and compiler conformance', () => {
  it.each(cases)('$name', ({ metadata, source, valid, code }) => {
    expect(validate(metadata), JSON.stringify(validate.errors)).toBe(valid)
    const compiled = compileJsonViewMetadata(source, registry, { metadata })
    if (valid) expect(compiled.diagnostics).toEqual([])
    else expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code }))
  })
})
