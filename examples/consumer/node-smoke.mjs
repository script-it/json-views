import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { compileJsonViewMetadata, JsonDocumentSession, replaceJsonValueInSource } from '@script-it/json-views-core'
import { JSONContent } from '@script-it/json-views-react'
import { createEmbeddingTypeRegistry, documentSource } from './src/embedding-data.mjs'

const original = '{"name":"Packed consumer","precise":9007199254740993,"value":42}'
const updated = replaceJsonValueInSource(original, ['value'], 43)
assert.equal(updated, '{"name":"Packed consumer","precise":9007199254740993,"value":43}')
assert.doesNotThrow(() => compileJsonViewMetadata(JSON.parse(updated)))
const session = new JsonDocumentSession({ id: 'node-consumer', content: original })
await session.commit(() => updated, async (content) => ({ content, revision: 'accepted' }))
assert.equal(session.getSnapshot().content, updated)
assert.equal(session.getSnapshot().dirty, false)
const html = renderToString(createElement(JSONContent, { content: updated, documentId: 'ssr-consumer', theme: 'light' }))
assert.match(html, /Packed consumer/)
assert.match(html, /json-views-root/)
console.log('Native ESM imports, source editing, document controller, and React SSR passed.')

for (const theme of ['light', 'dark']) {
  const compiled = compileJsonViewMetadata(JSON.parse(documentSource(theme)), createEmbeddingTypeRegistry())
  assert.deepEqual(compiled.diagnostics, [], `${theme} embedding fixture annotations must compile without diagnostics`)
  assert.equal(compiled.views.length, 1)
  assert.equal(compiled.views[0].display, 'adaptive')
  assert.deepEqual(compiled.views[0].sourcePath, ['record'])
}
console.log('Light and dark embedding annotations compile as page views without diagnostics.')
