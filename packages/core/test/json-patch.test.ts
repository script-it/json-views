import { describe, expect, it } from 'vitest'

import { applyJsonPatchInSource, jsonSourceRangeAtPath, jsonSourceRangesAtPaths, JsonPatchError } from '../src/json-source-patcher'

it('locates the exact source range for a JSON value path', () => {
  const source = '{\n  "tasks": [\n    { "title": "One" },\n    { "title": "Two" }\n  ]\n}'
  const range = jsonSourceRangeAtPath(source, ['tasks', 1])
  expect(source.slice(range.start, range.end)).toBe('{ "title": "Two" }')
  expect(jsonSourceRangesAtPaths(source, [['tasks', 1], ['tasks', 0]]).map((item) => source.slice(item.start, item.end)))
    .toEqual(['{ "title": "Two" }', '{ "title": "One" }'])
})

describe('RFC 6902 JSON Patch', () => {
  it('supports every standard operation in order', () => {
    const source = '{"tasks":[{"title":"One","done":false},{"title":"Two","done":false}],"copy":null}'
    const next = applyJsonPatchInSource(source, [
      { op: 'test', path: '/tasks/0/done', value: false },
      { op: 'replace', path: '/tasks/0/done', value: true },
      { op: 'add', path: '/tasks/1/tags', value: ['ready'] },
      { op: 'copy', from: '/tasks/0', path: '/copy' },
      { op: 'move', from: '/tasks/1', path: '/tasks/0' },
      { op: 'remove', path: '/tasks/1/title' },
    ])

    expect(JSON.parse(next)).toEqual({
      tasks: [{ title: 'Two', done: false, tags: ['ready'] }, { done: true }],
      copy: { title: 'One', done: true },
    })
  })

  it('inserts and appends array values and decodes JSON Pointer escapes', () => {
    const source = '{"a/b":{"~key":[1,3]}}'
    const next = applyJsonPatchInSource(source, [
      { op: 'add', path: '/a~1b/~0key/1', value: 2 },
      { op: 'add', path: '/a~1b/~0key/-', value: 4 },
    ])
    expect(JSON.parse(next)).toEqual({ 'a/b': { '~key': [1, 2, 3, 4] } })
  })

  it('replaces the root with the empty pointer', () => {
    expect(applyJsonPatchInSource('  {"old":true}\n', [{ op: 'replace', path: '', value: ['new'] }]))
      .toBe('  ["new"]\n')
  })

  it('preserves unrelated source and exact copied numeric tokens', () => {
    const source = '{ "exact":9007199254740993, "target":false, "items":[] }\n'
    const next = applyJsonPatchInSource(source, [
      { op: 'replace', path: '/target', value: true },
      { op: 'copy', from: '/exact', path: '/items/-' },
    ])
    expect(next).toContain('"exact":9007199254740993')
    expect(next).toContain('"items":[9007199254740993]')
    expect(next).toContain('"target":true')
  })

  it('reports the failing operation and leaves atomicity to the caller', () => {
    const source = '{"done":false,"untouched":1}'
    let error: unknown
    try {
      applyJsonPatchInSource(source, [
        { op: 'replace', path: '/done', value: true },
        { op: 'test', path: '/untouched', value: 2 },
      ])
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(JsonPatchError)
    expect(error).toMatchObject({ code: 'test-failed', operationIndex: 1, path: '/untouched' })
    expect(source).toBe('{"done":false,"untouched":1}')
  })

  it.each([
    [[{ op: 'replace', path: 'missing-slash', value: true }], 'invalid-pointer'],
    [[{ op: 'remove', path: '/missing' }], 'missing-path'],
    [[{ op: 'add', path: '/items/01', value: true }], 'invalid-array-index'],
    [[{ op: 'unknown', path: '' }], 'invalid-operation'],
    [[{ op: 'move', from: '/parent', path: '/parent/child' }], 'move-into-descendant'],
  ])('rejects invalid patches with diagnostic code %s', (patch, code) => {
    const source = '{"items":[],"parent":{"child":1}}'
    expect(() => applyJsonPatchInSource(source, patch)).toThrowError(expect.objectContaining({ code }))
  })
})
