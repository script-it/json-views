import type { JsonDocumentSave } from '@script-it/json-views-core'

/** Capabilities and controlled state supplied by an editable file host. */
export interface FileContentEditState {
  isEditing: boolean
  editContent: string
  onEditChange: (content: string) => void
  isSaving?: boolean
  /** Persists a renderer-generated version of the complete file. */
  onCommitContent?: JsonDocumentSave
}
