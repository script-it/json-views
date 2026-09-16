import { describe, expect, it } from 'vitest'

import { jsonPathReference, jsonRowsReferenceText } from './copy-json.js'

describe('JSON path references', () => {
  it('uses a filename-qualified JSON Pointer and escapes pointer tokens', () => {
    expect(jsonPathReference('my file.json', ['a/b', '~key', 2])).toBe('my%20file.json#/a~1b/~0key/2')
  })

  it('copies multiple row references as a JSON list', () => {
    expect(jsonRowsReferenceText('records.json', [
      { sourcePath: ['records', 3] },
      { sourcePath: ['records', 1] },
    ])).toBe('["records.json#/records/3","records.json#/records/1"]')
  })
})
