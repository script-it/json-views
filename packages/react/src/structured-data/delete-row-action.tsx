import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '../primitives/button.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog.js'

interface DeleteSelectedRowsActionProps {
  count: number
  disabled?: boolean
  onDelete: () => Promise<void>
  portalContainer?: HTMLElement | null
}

/** Confirmed bulk deletion for the rows a table has selected. One dialog
 * covers the whole batch, which lands as a single file write. */
export function DeleteSelectedRowsAction({
  count,
  disabled = false,
  onDelete,
  portalContainer,
}: DeleteSelectedRowsActionProps) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rowsLabel = count === 1 ? '1 row' : `${count.toLocaleString()} rows`

  const confirmDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the rows')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog modal={portalContainer == null} open={open} onOpenChange={(next) => {
      if (deleting) return
      setOpen(next)
      if (!next) setError(null)
    }}>
      <button
        type="button"
        data-id="structured-data-delete-selected-rows"
        aria-label={`Delete ${rowsLabel}`}
        title={`Delete ${rowsLabel}`}
        disabled={disabled}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-destructive transition-colors hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <DialogContent
        className="max-w-sm"
        contained={portalContainer != null}
        portalContainer={portalContainer}
      >
        <DialogHeader>
          <DialogTitle>Delete {rowsLabel}?</DialogTitle>
          <DialogDescription>
            This removes the selected {count === 1 ? 'row' : 'rows'} from the file. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-md border border-destructive-border bg-destructive-surface px-3 py-2 text-xs text-destructive-surface-foreground">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={deleting} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={deleting} data-id="structured-data-confirm-delete-selected-rows" onClick={() => { void confirmDelete() }}>
            {deleting ? 'Deleting…' : `Delete ${rowsLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
