import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Copy, Settings2, Trash2 } from 'lucide-react'
import { useJsonViewsPortalContainer } from '../../surface.js'
import { useAnchoredPosition } from '../../lib/use-anchored-position.js'
import { useDismiss } from '../../lib/use-dismiss.js'
import type { JsonViewViewSettings } from '../view-settings.js'

const ICON_BUTTON_CLASS = 'grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]'
const TEXTAREA_CLASS = 'h-32 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring'

function EditorSection({ children, summary, title }: { children: ReactNode; summary: string; title: string }) {
  return <details className="group border-t border-border">
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-xs hover:bg-accent">
      <span className="w-20 shrink-0 font-medium text-foreground">{title}</span>
      <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{summary}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
    </summary>
    <div className="px-1 pb-3 pt-1">{children}</div>
  </details>
}

export function HtmlViewSettings({ rawView, onSave, onPreview, onDelete, onDuplicate, disabled, saveUnavailableReason }: Parameters<typeof JsonViewViewSettings>[0]) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(rawView), [base, setBase] = useState(JSON.stringify(rawView)), [saving, setSaving] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null), content = useRef<HTMLElement>(null), portal = useJsonViewsPortalContainer()
  const position = useAnchoredPosition(open, anchor, content, 'bottom', 'end')
  const close = () => { onPreview?.(undefined); setOpen(false); setConfirmDelete(false) }
  useDismiss({ enabled: open && !saving, onDismiss: close, insideRefs: [anchor, content] })
  const apply = async () => {
    if (base !== JSON.stringify(rawView)) { setError('View settings changed outside this editor. Cancel and reopen before applying.'); return }
    if (!String(draft.name ?? '').trim() || !String(draft.html ?? '').trim()) { setError('Name and HTML are required'); return }
    setSaving(true); setError('')
    try { await onSave(draft); close() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save') } finally { setSaving(false) }
  }
  const runAction = async (action: (() => Promise<void>) | undefined) => {
    if (!action) return
    setSaving(true); setError('')
    try { await action(); close() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this view') } finally { setSaving(false) }
  }
  return <>
    <button ref={anchor} type="button" aria-label="View options" disabled={disabled} className={ICON_BUTTON_CLASS} onClick={() => { setDraft(rawView); setBase(JSON.stringify(rawView)); setError(''); setConfirmDelete(false); setOpen(true) }}><Settings2 className="h-3.5 w-3.5" /></button>
    {open && portal && createPortal(
      <section ref={content} aria-label="HTML view options" data-id="view-settings" data-anchored-popup style={position} className="z-[100] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-card p-2 text-xs text-foreground shadow-lg [transform-origin:top_right]">
        <header className="flex min-h-10 items-center gap-2 px-1 pb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">View options</h3>
            <div className="mt-1 flex min-w-0 items-center gap-0.5">
              <input aria-label="View name" className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring" value={String(draft.name ?? '')} onChange={event => setDraft({ ...draft, name: event.target.value })} />
              {onDuplicate && <button type="button" aria-label="Duplicate view" title="Duplicate view" disabled={saving} className={ICON_BUTTON_CLASS} onClick={() => { void runAction(onDuplicate) }}><Copy className="h-3.5 w-3.5" /></button>}
              {onDelete && <button type="button" aria-label="Delete view" title="Delete view" disabled={saving} className={`${ICON_BUTTON_CLASS} text-destructive hover:bg-destructive/10 hover:text-destructive`} onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        </header>

        {confirmDelete && onDelete && <div className="mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-2 text-destructive">
          <span className="min-w-0 flex-1">Delete this view?</span>
          <button type="button" className="rounded-md px-2 py-1 hover:bg-accent" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button type="button" data-id="jsonView-confirm-delete-view" disabled={saving} className="rounded-md bg-destructive px-2 py-1 text-destructive-foreground disabled:opacity-50" onClick={() => { void runAction(onDelete) }}>Delete</button>
        </div>}

        <EditorSection title="HTML" summary="Template">
          <textarea aria-label="View HTML" spellCheck={false} className={TEXTAREA_CLASS} value={String(draft.html ?? '')} onChange={event => setDraft({ ...draft, html: event.target.value })} />
        </EditorSection>
        <EditorSection title="CSS" summary={String(draft.css ?? '').trim() ? 'Custom styles' : 'None'}>
          <textarea aria-label="View CSS" spellCheck={false} className={TEXTAREA_CLASS} value={String(draft.css ?? '')} onChange={event => setDraft({ ...draft, css: event.target.value })} />
        </EditorSection>

        {(error || saveUnavailableReason) && <p role="alert" className="px-1 py-2 text-destructive">{error || saveUnavailableReason}</p>}
        <footer className="flex justify-end gap-1 border-t border-border px-1 pt-2">
          <button type="button" className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => onPreview?.(draft)} disabled={saving}>Preview</button>
          <button type="button" className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={close} disabled={saving}>Cancel</button>
          <button type="button" data-id="jsonView-save-view" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={() => { void apply() }} disabled={saving || disabled || Boolean(saveUnavailableReason)}>{saving ? 'Saving…' : 'Save view'}</button>
        </footer>
      </section>, portal,
    )}
  </>
}
