import type { CachedBrowserWorkspace } from './browser-workspace.js'
import { documentRouteViews, routeActiveView } from './document-route.js'
import type { OpenDocument } from './document-model.js'

/** Reconcile every bundled-data release in one place. Cached sources are user
 * edits; pristine built-ins are always supplied by the current manifest.
 * documentId is permanent, even when the title, filename or folder changes. */
export function reconcileBuiltinDocuments(
  builtins: OpenDocument[],
  saved: OpenDocument[],
  workspace?: CachedBrowserWorkspace,
): { documents: OpenDocument[]; activeDocument?: OpenDocument } {
  const savedById = new Map(saved.map(document => [document.id, document]))
  const builtinIds = new Set(builtins.map(document => document.id))
  const documents = builtins.map(builtin => {
    const edited = savedById.get(builtin.id)
    // The filename fallback reads the old presentation format once. New writes
    // use IDs, so future moves and renames need no additional migration rules.
    const state = workspace?.templateStates?.[builtin.id] ?? workspace?.templateStates?.[builtin.filename]
    const document = edited
      ? { ...edited, filename: builtin.filename, relativePath: builtin.relativePath, label: builtin.label }
      : { ...builtin, mode: state?.mode ?? builtin.mode, presentationState: state?.presentationState ?? builtin.presentationState }
    return restoreBuiltinView(document)
  })
  // Removed built-ins only survive if the user has an edited, cached copy.
  documents.push(...saved.filter(document => !builtinIds.has(document.id)))
  const activeId = saved[workspace?.activeDocumentIndex ?? -1]?.id ?? workspace?.activeBuiltinId
  const activeDocument = activeId
    ? documents.find(document => document.id === activeId)
    : documents.find(document => builtinIds.has(document.id) && document.filename === workspace?.activeTemplateFilename)
  return { documents, activeDocument }
}

function restoreBuiltinView(document: OpenDocument): OpenDocument {
  const active = document.presentationState?.activeView
  if (!active?.startsWith('view:')) return document
  try {
    if (documentRouteViews(document).some(view => `view:${view.id}` === active)) return document
    return { ...document, presentationState: { ...document.presentationState!, activeView: routeActiveView(document) } }
  } catch {
    // Preserve invalid user source for repair in the source editor.
    return { ...document, mode: 'source', presentationState: { ...document.presentationState!, activeView: 'source' } }
  }
}
