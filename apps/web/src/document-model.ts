import { prefersSource, convertToJsonViewsDocument, JsonDocumentSession, rebaseJsonViewsMetadata, validateCsvSource } from '@script-it/json-views-core'
import type { JsonViewsPresentationState } from '@script-it/json-views-react'

export function filenameFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'document.json'
}

export interface OpenDocument {
  cacheable: boolean
  controller: JsonDocumentSession
  id: string
  initialContent: string
  filename: string
  relativePath?: string
  label?: string
  metadata?: Record<string, unknown>
  mode: 'view' | 'source'
  presentationState?: JsonViewsPresentationState
  viewerGeneration: number
  token?: string
}

type DocumentFormat = 'json' | 'csv'

export function documentFormat(filename: string): DocumentFormat {
  return /\.csv$/i.test(filename) ? 'csv' : 'json'
}

export interface RepresentativeSample {
  presentationState?: JsonViewsPresentationState
  sourceFile: string
  annotationFile?: string
  relativePath?: string
  title: string
}

interface OpenDocumentOptions {
  relativePath?: string
  cacheable?: boolean
  id?: string
  label?: string
  metadata?: Record<string, unknown>
  mode?: 'view' | 'source'
  presentationState?: JsonViewsPresentationState
  revision?: string
  token?: string
}

function newDocumentId(): string {
  if (typeof crypto.randomUUID === 'function') return `document-${crypto.randomUUID()}`
  // LAN previews use plain HTTP, where randomUUID is unavailable. getRandomValues
  // still provides 128 random bits without relying on a reload-sensitive counter.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `document-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function openDocument(
  content: string,
  filename: string,
  options: OpenDocumentOptions = {},
): OpenDocument {
  const { id: restoredId, label, metadata, mode, presentationState, revision, token } = options
  const cacheable = options.cacheable ?? (token === undefined)
  // Fast Refresh can reload this module while React retains open sessions.
  // New IDs must not restart and collide; cached documents retain their identity.
  const id = restoredId ?? newDocumentId()
  const validateContent = documentFormat(filename) === 'csv' ? validateCsvSource : undefined
  return {
    cacheable,
    id,
    initialContent: content,
    controller: new JsonDocumentSession({ id, content, revision, validateContent }),
    filename,
    relativePath: options.relativePath,
    label,
    metadata,
    mode: mode ?? (sourceError(content, filename) || (presentationState?.activeView ? presentationState.activeView === 'source' : documentFormat(filename) !== 'csv' && prefersSource(content, metadata)) ? 'source' : 'view'),
    presentationState,
    viewerGeneration: 0,
    token,
  }
}

export function untitledFilename(documents: readonly OpenDocument[]): string {
  const names = new Set(documents.map((document) => document.filename))
  if (!names.has('untitled.json')) return 'untitled.json'
  let number = 2
  while (names.has(`untitled-${number}.json`)) number += 1
  return `untitled-${number}.json`
}

export function sourceError(content: string, filename: string): string | undefined {
  try {
    if (documentFormat(filename) === 'csv') validateCsvSource(content)
    else JSON.parse(content)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : `Invalid ${documentFormat(filename).toUpperCase()}`
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Embeds a versioned annotation schema without leaving root arrays path-invalid. */
export function embedJsonViewMetadata(source: string, metadata: Record<string, unknown>): string {
  const data: unknown = JSON.parse(source)
  if (Array.isArray(data)) {
    return convertToJsonViewsDocument({ root: data, source, metadata, sourceFormat: 'json-array' })
  }
  if (isRecord(data)) {
    return convertToJsonViewsDocument({ root: data, source, metadata, sourceFormat: 'json-object' })
  }
  return `{\n  "$jsonviews": ${JSON.stringify(rebaseJsonViewsMetadata(metadata), null, 2)},\n  "data": ${source.trim()}\n}\n`
}
