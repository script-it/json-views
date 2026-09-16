import { useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { ConditionalTooltip } from '../primitives/tooltip.js'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../primitives/dialog.js'

/** The viewer owns annotation persistence; the host reports data-save progress. */
export function ViewSaveStatus({ embedded, objectRoot, saving, dirty, error, invalidFormat, invalidSourceError, onSave, conversionConfirmation = 'viewer' }: {
  conversionConfirmation?: 'viewer' | 'host'
  embedded: boolean
  objectRoot: boolean
  saving: boolean
  dirty: boolean
  invalidSourceError?: string
  invalidFormat?: string
  error?: string
  onSave?: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const problem = error || failure
  const busy = saving || pending
  const label = problem ? 'Changes are not saved.' : busy ? 'Saving…'
    : invalidFormat ? dirty ? `Invalid ${invalidFormat}. Changes are not saved.` : `Data is saved, but this is not valid ${invalidFormat}.`
    : dirty ? 'Changes are not saved.'
    : embedded ? 'Data and views are saved.' : 'Data is saved, views are not. Click to save.'
  const details = [invalidSourceError, problem].filter(Boolean).join("\n\n") || (invalidFormat ? `The source is not valid ${invalidFormat}.` : undefined)
  const tooltip = details ? `${label} Click for details.` : label
  const actionable = !embedded && Boolean(onSave) && !busy && !dirty && !error && !invalidFormat
  const save = () => {
    setOpen(false); setFailure(undefined); setPending(true)
    void onSave?.().catch((cause: unknown) => setFailure(cause instanceof Error ? cause.message : 'Could not save views')).finally(() => setPending(false))
  }
  const icon = problem ? <AlertCircle className="h-3.5 w-3.5" /> : busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />
  const className = `grid h-7 w-7 shrink-0 place-items-center rounded-md ${invalidFormat || problem ? 'text-red-400' : problem || dirty || !embedded ? 'text-orange-400' : 'text-green-600'}`
  return <>
    <ConditionalTooltip enabled={!open && !detailsOpen} label={tooltip}>
      {details ? <button type="button" aria-label={tooltip} className={`${className} hover:bg-accent`} onClick={() => setDetailsOpen(true)}>{icon}</button> : actionable ? <button type="button" aria-label={label} className={`${className} hover:bg-accent`} onClick={() => { if (!objectRoot && conversionConfirmation === 'host') save(); else { setFailure(undefined); setOpen(true) } }}>{icon}</button>
        : <span role="img" tabIndex={0} aria-label={label} className={className}>{icon}</span>}
    </ConditionalTooltip>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{invalidFormat ? `Invalid ${invalidFormat}` : 'Save error'}</DialogTitle>
        <DialogDescription className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{details}</DialogDescription>
        <DialogFooter><button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setDetailsOpen(false)}>Close</button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Save views to JSON?</DialogTitle>
        <DialogDescription>{objectRoot
          ? 'Adds a $jsonviews property to this JSON. Future view changes will save there automatically.'
          : 'Saving views requires object-root JSON. Your data will move under a data property, alongside $jsonviews. Code that reads this document must use the data property after conversion.'}</DialogDescription>
        <DialogFooter>
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={save}>{objectRoot ? 'Save views' : 'Convert to object-root JSON'}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
