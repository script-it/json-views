import { useEffect, useRef, useState } from 'react'
import type { OpenDocument } from './document-model.js'
import { documentRouteFilename, documentRouteUrl, documentRouteViews, findRouteDocument, readDocumentRoute, routeActiveView } from './document-route.js'

function selectedView(document: OpenDocument, activeView = document.presentationState?.activeView) {
  try {
    const views = documentRouteViews(document)
    const view = activeView === 'root' ? undefined : views.find((candidate) => `view:${candidate.id}` === activeView) ?? views[0]
    return { key: view ? `view:${view.id}` : 'root', name: view?.name }
  } catch {
    return { key: 'root', name: undefined }
  }
}

/** URL navigation belongs to the website host; embedded viewers keep their own state. */
export function useDocumentRoute({ documents, activeDocumentId, ready, onNavigate }: {
  documents: OpenDocument[]
  activeDocumentId: string
  ready: boolean
  onNavigate: (document: OpenDocument, activeView: string) => void
}) {
  const [error, setError] = useState('')
  const [, setNavigation] = useState(0)
  const pendingHash = useRef<string | undefined>(location.hash)
  const previousSelection = useRef<string | undefined>(undefined)
  const lastHandledUrl = useRef('')

  useEffect(() => {
    const navigate = () => {
      // A history traversal can emit both popstate and hashchange.
      if (lastHandledUrl.current === location.href) return
      lastHandledUrl.current = location.href
      pendingHash.current = location.hash
      setNavigation((value) => value + 1)
    }
    window.addEventListener('hashchange', navigate)
    window.addEventListener('popstate', navigate)
    return () => {
      window.removeEventListener('hashchange', navigate)
      window.removeEventListener('popstate', navigate)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const current = documents.find((document) => document.id === activeDocumentId)
    if (!current) return
    const selection = (document: OpenDocument, activeView = document.presentationState?.activeView) =>
      JSON.stringify([document.id, documentRouteFilename(document), selectedView(document, activeView)])
    if (pendingHash.current !== undefined) {
      const hash = pendingHash.current
      pendingHash.current = undefined
      try {
        const route = readDocumentRoute(hash)
        if (route) {
          const document = findRouteDocument(documents, route.file)
          const activeView = routeActiveView(document, route.view)
          previousSelection.current = selection(document, activeView)
          setError('')
          onNavigate(document, activeView)
          return
        }
      } catch (cause) {
        previousSelection.current = selection(current)
        setError(cause instanceof Error ? cause.message : 'Could not open this file link.')
        return
      }
    }
    const nextSelection = selection(current)
    if (previousSelection.current === nextSelection) return
    const firstSelection = previousSelection.current === undefined
    previousSelection.current = nextSelection
    try {
      const url = documentRouteUrl(location.href, documents, current, selectedView(current).name)
      if (url !== location.href) {
        if (firstSelection) history.replaceState(null, '', url)
        else history.pushState(null, '', url)
      }
      lastHandledUrl.current = location.href
      setError('')
    } catch {
      // Ambiguous names must not leave the address pointing at a different file.
      // The bare workspace URL can still restore the current local selection.
      const url = new URL(location.href)
      url.hash = ''
      if (current.token) url.searchParams.set('token', current.token)
      else url.searchParams.delete('token')
      if (url.toString() !== location.href) history.pushState(null, '', url)
      lastHandledUrl.current = location.href
      setError('')
    }
  })

  return { routeError: error, dismissRouteError: () => setError('') }
}
