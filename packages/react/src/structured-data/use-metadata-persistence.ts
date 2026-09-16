import { useCallback, useState } from 'react'
import type { StructuredDocumentFormat } from '@script-it/json-views-core'

export type MetadataPersistence = 'inferred' | 'session' | 'embedded'

/** Annotation storage is independent of source format conversion.
 * Controlled metadata is always authoritative, including its removal.
 */
export function useMetadataPersistence({ metadata, mode, format, onMetadataChange }: {
  metadata?: unknown
  mode?: MetadataPersistence
  format: StructuredDocumentFormat
  onMetadataChange?: (metadata: Record<string, unknown>) => Promise<void>
}) {
  const [sessionMetadata, setSessionMetadata] = useState<Record<string, unknown>>()
  const persistence = metadata !== undefined ? 'session' : mode ?? (format === 'json-object' ? 'embedded' : 'inferred')
  const effectiveMetadata = metadata !== undefined ? metadata : persistence === 'session' ? sessionMetadata : undefined
  const saveSessionMetadata = useCallback(async (next: Record<string, unknown>) => {
    if (metadata !== undefined && !onMetadataChange) throw new Error('These annotations are read-only')
    await onMetadataChange?.(next)
    // Do not cache controlled props: removing them must restore inference/embedded metadata.
    if (metadata === undefined) setSessionMetadata(next)
  }, [metadata, onMetadataChange])
  return { persistence, effectiveMetadata, saveSessionMetadata }
}
