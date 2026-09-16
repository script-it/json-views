import { describe, expect, it, vi } from 'vitest'
import { JsonDocumentConflictError, JsonDocumentSession, type JsonDocumentSave } from '../src/document-session.js'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('JsonDocumentSession', () => {
  it('retains sequential successful commits while host echoes lag', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{"a":0,"b":0}' })
    const save = vi.fn<JsonDocumentSave>(async () => {})
    await session.commit(() => '{"a":1,"b":0}', save)
    await session.commit(() => '{"a":1,"b":1}', save)
    session.receive({ content: '{"a":1,"b":0}' })
    expect(session.getSnapshot().content).toBe('{"a":1,"b":1}')
    expect(session.getSnapshot().dirty).toBe(false)
    await session.commit((source) => source.replace('"a":1', '"a":2'), save)
    expect(save.mock.calls[2]?.[0]).toBe('{"a":2,"b":1}')
  })

  it('acknowledges an older save without overwriting a newer draft', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    const pending = deferred<{ content: string; revision: string }>()
    const commit = session.commit(() => '{"draft":"first"}', () => pending.promise)
    session.edit('{"draft":"second"}')
    pending.resolve({ content: '{"draft":"first"}', revision: 'r1' })
    await commit
    expect(session.getSnapshot()).toMatchObject({ content: '{"draft":"second"}', acknowledgedContent: '{"draft":"first"}', revision: 'r1', dirty: true, saving: false })
  })

  it('returns real save rejection and preserves a retryable draft', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    const pending = deferred()
    const rejected = expect(session.commit(() => '{"x":1}', () => pending.promise)).rejects.toThrow('disk full')
    expect(session.getSnapshot().saving).toBe(true)
    pending.reject(new Error('disk full'))
    await rejected
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', acknowledgedContent: '{}', dirty: true, saving: false })
    await session.commit((source) => source, async () => {})
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', dirty: false, error: undefined })
  })

  it('honors versioned external rollbacks and detects in-flight conflicts', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    await session.commit(() => '{"x":1}', async () => ({ content: '{"x":1}', revision: 'r1' }))
    session.receive({ content: '{}', revision: 'r2' })
    expect(session.getSnapshot().content).toBe('{}')
    const pending = deferred()
    const rejected = expect(session.commit(() => '{"mine":1}', () => pending.promise)).rejects.toBeInstanceOf(JsonDocumentConflictError)
    session.receive({ content: '{"external":1}', revision: 'r3' })
    pending.resolve()
    await rejected
    expect(session.getSnapshot()).toMatchObject({ content: '{"mine":1}', acknowledgedContent: '{"external":1}' })
    session.reset()
    expect(session.getSnapshot()).toMatchObject({ content: '{"external":1}', error: undefined, dirty: false })
  })

  it('captures destination and revision, rejects overlapping saves, and preserves arbitrary text', async () => {
    const session = new JsonDocumentSession({ id: 'workspace/file', content: '{}', revision: 'r0' })
    const pending = deferred()
    const save = vi.fn<JsonDocumentSave>(() => pending.promise)
    const commit = session.commit(() => '{"x":1}', save)
    expect(save).toHaveBeenCalledWith('{"x":1}', { documentId: 'workspace/file', baseContent: '{}', baseRevision: 'r0' })
    await expect(session.commit(() => '{}', save)).rejects.toThrow('already in progress')
    pending.resolve()
    await commit
    session.edit('{')
    await session.commit((source) => source, save)
    expect(save).toHaveBeenCalledTimes(2)
    expect(session.getSnapshot()).toMatchObject({ content: '{', acknowledgedContent: '{', dirty: false })
  })

  it('uses an optional content validator for non-JSON sessions', async () => {
    const session = new JsonDocumentSession({
      id: 'rows.csv',
      content: 'name\nAda\n',
      validateContent: (content) => {
        if (!content.startsWith('name\n')) throw new SyntaxError('Missing CSV header')
      },
    })
    const save = vi.fn<JsonDocumentSave>(async () => {})
    await session.commit(() => 'name\nGrace\n', save)
    expect(save).toHaveBeenCalledOnce()
    await expect(session.commit(() => 'wrong\nGrace\n', save)).rejects.toThrow('Missing CSV header')
  })

  it('skips unchanged writes and isolates independent document sessions', async () => {
    const a = new JsonDocumentSession({ id: 'a', content: '{}' })
    const b = new JsonDocumentSession({ id: 'b', content: '{}' })
    const save = vi.fn<JsonDocumentSave>(async () => {})
    await a.commit((source) => source, save)
    expect(save).not.toHaveBeenCalled()
    a.edit('{"a":1}')
    expect(b.getSnapshot().content).toBe('{}')
  })
  it('ignores known versioned acknowledgements that arrive after a newer successful save', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    await session.commit(() => '{"x":1}', async () => ({ content: '{"x":1}', revision: 'r1' }))
    await session.commit(() => '{"x":2}', async () => ({ content: '{"x":2}', revision: 'r2' }))
    session.receive({ content: '{"x":1}', revision: 'r1' })
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":2}', acknowledgedContent: '{"x":2}', revision: 'r2', dirty: false })
    const save = vi.fn<JsonDocumentSave>(async () => {})
    await session.commit(() => '{"x":3}', save)
    expect(save.mock.calls[0]?.[1]).toMatchObject({ baseContent: '{"x":2}', baseRevision: 'r2' })
  })

  it('ignores historical versioned echoes while a newer save or local draft is pending', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    await session.commit(() => '{"x":1}', async () => ({ content: '{"x":1}', revision: 'r1' }))
    const pending = deferred<{ content: string; revision: string }>()
    const commit = session.commit(() => '{"x":2}', () => pending.promise)
    session.edit('{"x":3}')
    session.receive({ content: '{}', revision: 'r0' })
    pending.resolve({ content: '{"x":2}', revision: 'r2' })
    await commit
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":3}', acknowledgedContent: '{"x":2}', revision: 'r2', dirty: true, error: undefined })
  })

  it('preserves a matching in-flight host revision over an older response and keeps newer drafts', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    const pending = deferred<{ content: string; revision: string }>()
    const commit = session.commit(() => '{"x":1}', () => pending.promise)
    session.receive({ content: '{"x":1}', revision: 'r2' })
    session.receive({ content: '{"x":1}' })
    session.edit('{"x":2}')
    pending.resolve({ content: '{"x":1}', revision: 'r1' })
    await commit
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":2}', acknowledgedContent: '{"x":1}', revision: 'r2', dirty: true })
    session.receive({ content: '{"x":1}', revision: 'r1' })
    expect(session.getSnapshot().revision).toBe('r2')
  })

  it('does not mistake a rejected draft for a successful echo after reset', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    await expect(session.commit(() => '{"x":1}', async () => { throw new Error('disk full') })).rejects.toThrow('disk full')
    session.reset()
    session.receive({ content: '{"x":1}' })
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', acknowledgedContent: '{"x":1}', dirty: false, error: undefined })
  })

  it('does not remember a matching pending observation if persistence fails', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    const pending = deferred()
    const rejected = expect(session.commit(() => '{"x":1}', () => pending.promise)).rejects.toThrow('disk full')
    session.receive({ content: '{"x":1}' })
    session.edit('{"x":2}')
    pending.reject(new Error('disk full'))
    await rejected
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":2}', acknowledgedContent: '{}', dirty: true })
    session.reset()
    session.receive({ content: '{"x":1}' })
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', acknowledgedContent: '{"x":1}', dirty: false })
  })

  it('requires an authoritative reload to intentionally restore a known historical identity', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'hash-empty' })
    await session.commit(() => '{"x":1}', async () => ({ content: '{"x":1}', revision: 'hash-x1' }))
    session.receive({ content: '{}', revision: 'hash-empty' })
    expect(session.getSnapshot().content).toBe('{"x":1}')
    session.receive({ content: '{}', revision: 'hash-empty' }, { authoritative: true })
    expect(session.getSnapshot()).toMatchObject({ content: '{}', acknowledgedContent: '{}', revision: 'hash-empty', dirty: false })
  })

  it('detects an external rollback to the base content while its save is in flight', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    const pending = deferred<{ content: string; revision: string }>()
    const rejected = expect(session.commit(() => '{"x":1}', () => pending.promise)).rejects.toBeInstanceOf(JsonDocumentConflictError)
    session.receive({ content: '{}', revision: 'r2' })
    pending.resolve({ content: '{"x":1}', revision: 'r1' })
    await rejected
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', acknowledgedContent: '{}', revision: 'r2', dirty: true })
  })

  it('acknowledges an external save that exactly matches a failed local draft', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    await expect(session.commit(() => '{"x":1}', async () => { throw new Error('offline') })).rejects.toThrow('offline')
    session.receive({ content: '{"x":1}', revision: 'r1' })
    expect(session.getSnapshot()).toMatchObject({ content: '{"x":1}', acknowledgedContent: '{"x":1}', dirty: false, error: undefined })
    await session.commit(() => '{"x":2}', async () => {})
    expect(session.getSnapshot().dirty).toBe(false)
  })

  it('publishes save start atomically so subscribers cannot start overlapping writes', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}' })
    const pending = deferred()
    const save = vi.fn<JsonDocumentSave>(() => pending.promise)
    const overlapping: Promise<void>[] = []
    let attempted = false
    const unsubscribe = session.subscribe(() => {
      if (!attempted && session.getSnapshot().content === '{"x":1}' && !session.getSnapshot().saving) {
        attempted = true
        overlapping.push(session.commit((source) => source, save))
      }
    })
    const commit = session.commit(() => '{"x":1}', save)
    expect(save).toHaveBeenCalledTimes(1)
    expect(overlapping).toEqual([])
    unsubscribe()
    pending.resolve()
    await commit
  })

  it('accepts a normalized host echo confirmed by the persistence response', async () => {
    for (const newerDraft of [undefined, '{"x":2}']) {
      const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
      const pending = deferred<{ content: string; revision: string }>()
      const commit = session.commit(() => '{"x":1}', () => pending.promise)
      session.receive({ content: '{ "x": 1 }', revision: 'r1' })
      if (newerDraft) session.edit(newerDraft)
      pending.resolve({ content: '{ "x": 1 }', revision: 'r1' })
      await commit
      expect(session.getSnapshot()).toMatchObject({
        content: newerDraft ?? '{ "x": 1 }', acknowledgedContent: '{ "x": 1 }',
        revision: 'r1', dirty: newerDraft !== undefined, error: undefined,
      })
    }
  })

  it('accepts a save when a later matching host observation supersedes an earlier external change', async () => {
    const session = new JsonDocumentSession({ id: 'a', content: '{}', revision: 'r0' })
    const pending = deferred<{ content: string; revision: string }>()
    const commit = session.commit(() => '{"mine":1}', () => pending.promise)
    session.receive({ content: '{"external":1}', revision: 'r1' })
    session.receive({ content: '{"mine":1}', revision: 'r2' })
    pending.resolve({ content: '{"mine":1}', revision: 'r2' })
    await commit
    expect(session.getSnapshot()).toMatchObject({ content: '{"mine":1}', acknowledgedContent: '{"mine":1}', revision: 'r2', dirty: false, error: undefined })
  })

})
