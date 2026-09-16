import { CSVContent, JSONContent } from './json/json-content.js'
import { fileDataToText, type FileContentData } from './lib/file-data.js'
import type { FileContentEditState } from './file-content-edit-state.js'

export function FileContentView({
  data,
  edit,
  fillHeight,
  path,
}: {
  data: FileContentData
  edit?: FileContentEditState
  fillHeight?: boolean
  path: string
}) {
  const props = { content: fileDataToText(data), edit, fillHeight, path }
  return /\.csv$/i.test(path) || data.mimeType === 'text/csv' ? <CSVContent {...props} /> : <JSONContent {...props} />
}
