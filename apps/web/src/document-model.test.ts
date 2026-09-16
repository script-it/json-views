import { afterEach, expect, it, vi } from 'vitest'
import { openDocument } from './document-model.js'

afterEach(() => vi.unstubAllGlobals())

it('opens independent document sessions on HTTP origins without randomUUID', () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  const first = openDocument('{"value":1}', 'first.json')
  const second = openDocument('{"value":2}', 'second.json')
  expect(first.id).not.toBe(second.id)
  expect(first.controller.getSnapshot().content).toBe('{"value":1}')
  expect(second.controller.getSnapshot().content).toBe('{"value":2}')
})

it('preserves cached document identities without generating a new ID', () => {
  const random = vi.fn(() => { throw new Error('Must not generate a new identity') })
  vi.stubGlobal('crypto', { randomUUID: random, getRandomValues: random })
  const restored = openDocument('{}', 'cached.json', { id: 'document-existing' })
  expect(restored.id).toBe('document-existing')
  expect(random).not.toHaveBeenCalled()
})
it('uses the compact nested source default only without a saved choice', () => {
  const content = JSON.stringify({ envelope: { body: { action: 'opened', number: 1, author: 'Ada' } } })
  expect(openDocument(content, 'event.json').mode).toBe('source')
  expect(openDocument(content, 'event.json', { mode: 'view' }).mode).toBe('view')
  expect(openDocument(content, 'event.json', { presentationState: { version: 1, activeView: 'root' } }).mode).toBe('view')
  expect(openDocument(content, 'event.json', { metadata: { version: 1, views: [] } }).mode).toBe('view')
})
