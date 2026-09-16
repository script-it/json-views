import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { JsonDocumentSession, type DocumentContentValidator, type JsonDocumentSave } from '@script-it/json-views-core'

interface OptimisticTextDocumentOptions {
  content: string
  documentKey?: string
  revision?: string
  saveContent?: JsonDocumentSave
  saving?: boolean
  validateContent?: DocumentContentValidator
}

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** React subscription to a document session; the host owns durable persistence. */
export function useOptimisticTextDocument({
  content,
  documentKey,
  revision,
  saveContent,
  saving = false,
  validateContent,
}: OptimisticTextDocumentOptions) {
  const session = useMemo(() => new JsonDocumentSession({
    id: documentKey ?? 'document', content, revision, validateContent,
  }), [documentKey, validateContent])
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useBrowserLayoutEffect(() => { session.receive({ content, revision }) }, [session, content, revision])

  const commit = useCallback((buildNext: (source: string) => string) => {
    if (!saveContent) return Promise.reject(new Error('This file is read-only'))
    if (saving) return Promise.reject(new Error('A save is already in progress'))
    return session.commit(buildNext, saveContent)
  }, [session, saveContent, saving])
  const edit = useCallback((nextContent: string) => { session.edit(nextContent) }, [session])

  return {
    canCommit: saveContent !== undefined,
    commit,
    content: snapshot.content,
    acknowledgedContent: snapshot.acknowledgedContent,
    edit,
    saving: snapshot.saving || saving,
    error: snapshot.error?.message,
    dirty: snapshot.dirty,
    reset: () => session.reset(),
  }
}
