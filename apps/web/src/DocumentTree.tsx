import { Braces, ChevronRight, Folder, Table2, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { documentFormat, type OpenDocument } from './document-model.js'

interface Directory {
  name: string
  path: string
  folders: Map<string, Directory>
  documents: OpenDocument[]
}

interface DocumentTreeProps {
  documents: OpenDocument[]
  activeDocumentId: string
  onOpen: (document: OpenDocument) => void
  onDelete: (document: OpenDocument) => void
}

export function DocumentTree({ documents, activeDocumentId, onOpen, onDelete }: DocumentTreeProps) {
  const root: Directory = { name: '', path: '', folders: new Map(), documents: [] }
  for (const document of documents) {
    let directory = root
    const segments = document.relativePath?.split('/').filter(Boolean).slice(0, -1) ?? []
    for (const name of segments) {
      let child = directory.folders.get(name)
      if (!child) {
        child = { name, path: `${directory.path}${name}/`, folders: new Map(), documents: [] }
        directory.folders.set(name, child)
      }
      directory = child
    }
    directory.documents.push(document)
  }

  const renderDirectory = (directory: Directory): ReactNode => <>
    {directory.documents.map((document) => {
      const DocumentIcon = documentFormat(document.filename) === 'csv' ? Table2 : Braces
      const path = document.relativePath ?? document.filename
      return <div className="document-item" key={document.id}>
        <button className="document-open" type="button" data-id="open-json-document"
          aria-current={document.id === activeDocumentId ? 'page' : undefined}
          aria-label={`Open ${path}`} onClick={() => onOpen(document)}>
          <DocumentIcon size={16} aria-hidden="true" />
          <span title={path}>{document.filename.replace(/\.(json|csv)$/i, '')}</span>
        </button>
        <button className="document-delete" type="button" aria-label={`Delete ${path}`} title={`Delete ${path}`} onClick={() => onDelete(document)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    })}
    {[...directory.folders.values()].map((folder) => <details className="document-folder" key={folder.path}>
      <summary className="document-open" title={folder.path}>
        <ChevronRight className="folder-chevron" size={12} aria-hidden="true" />
        <Folder size={16} aria-hidden="true" /><span>{folder.name}</span>
      </summary>
      <div className="document-folder-children">{renderDirectory(folder)}</div>
    </details>)}
  </>
  return renderDirectory(root)
}
