import { describe, expect, it } from 'vitest'
import { openDocument } from './document-model.js'
import { reconcileBuiltinDocuments } from './builtin-documents.js'
import type { CachedBrowserWorkspace } from './browser-workspace.js'

const source = (id = 'board') => JSON.stringify({ $jsonviews: { version: 1, views: [{ id, name: id, path: '$.tasks' }] }, tasks: [] })
const builtin = (content = source()) => openDocument(content, 'Tasks.json', { id: 'permanent-tasks', cacheable: false })
const workspace = (extra: Partial<CachedBrowserWorkspace> = {}): CachedBrowserWorkspace => ({ version: 1, activeDocumentIndex: -1, documents: [], ...extra })

describe('built-in release reconciliation', () => {
  it('uses current source for untouched documents and drops removed pristine files', () => {
    const current = builtin(source('new-board'))
    const result = reconcileBuiltinDocuments([current], [], workspace({ activeBuiltinId: 'removed' }))
    expect(result.documents).toEqual([current])
    expect(result.activeDocument).toBeUndefined()
  })

  it('keeps edited source and selection across a move and rename', () => {
    const edited = openDocument('{"edited":true}', 'Old.json', { id: 'permanent-tasks', relativePath: 'Old/Old.json' })
    const current = { ...builtin(), relativePath: 'New/Tasks.json' }
    const result = reconcileBuiltinDocuments([current], [edited], workspace({ activeDocumentIndex: 0 }))
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].controller.getSnapshot().content).toBe('{"edited":true}')
    expect(result.activeDocument).toMatchObject({ id: edited.id, filename: 'Tasks.json', relativePath: 'New/Tasks.json' })
  })

  it('preserves removed edited built-ins and unrelated imported files', () => {
    const removed = openDocument('{}', 'Removed.json', { id: 'removed' })
    const imported = openDocument('{}', 'Mine.json')
    expect(reconcileBuiltinDocuments([], [removed, imported]).documents).toEqual([removed, imported])
  })

  it('restores ID-based selection and falls back when a saved view was removed', () => {
    const result = reconcileBuiltinDocuments([builtin()], [], workspace({
      activeBuiltinId: 'permanent-tasks',
      templateStates: { 'permanent-tasks': { presentationState: { version: 1, activeView: 'view:removed' } } },
    }))
    expect(result.activeDocument?.presentationState?.activeView).toBe('view:board')
  })

  it('reads legacy filename state and keeps valid selections', () => {
    const result = reconcileBuiltinDocuments([builtin()], [], workspace({
      activeTemplateFilename: 'Tasks.json',
      templateStates: { 'Tasks.json': { presentationState: { version: 1, activeView: 'view:board' } } },
    }))
    expect(result.activeDocument?.presentationState?.activeView).toBe('view:board')
  })
})
