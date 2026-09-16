import { useState } from 'react'
import { ChevronDown, FolderUp, Upload } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@script-it/json-views-react'

export function UploadButton({ disabled, busy, onFiles, onFolder }: {
  disabled: boolean
  busy: boolean
  onFiles: () => void
  onFolder: () => void
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return <div className="upload-control" ref={setContainer}>
    <button className="button secondary upload-files" type="button" disabled={disabled}
      title="Upload JSON or CSV files" onClick={onFiles}>
      <Upload size={15} aria-hidden="true" />{busy ? 'Importing…' : 'Upload'}
    </button>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="button secondary upload-options" type="button" aria-label="Upload options"
          title="Upload options" disabled={disabled}><ChevronDown size={12} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent container={container} className="upload-menu" side="top" align="end">
        <DropdownMenuItem className="upload-menu-item" onSelect={onFolder}>
          <FolderUp size={15} aria-hidden="true" />Upload folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
}
